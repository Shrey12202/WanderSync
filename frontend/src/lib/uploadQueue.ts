/**
 * Offline upload queue using IndexedDB.
 * Queues uploads when offline and retries when connection is restored.
 */

import type { QueuedUpload } from "@/types";
import { uploadMedia } from "./api";

const DB_NAME = "worldmap_uploads";
const STORE_NAME = "queue";
const DB_VERSION = 1;
const MAX_RETRIES = 5;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueUpload(
  file: File,
  tripId: string,
  stopId?: string,
  caption?: string,
  latitude?: number,
  longitude?: number
): Promise<string> {
  const item: QueuedUpload = {
    id: crypto.randomUUID(),
    file,
    tripId,
    stopId,
    caption,
    latitude,
    longitude,
    status: "pending",
    retryCount: 0,
    createdAt: Date.now(),
  };

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(item);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Try immediately if online
  if (navigator.onLine) {
    processQueue();
  }

  return item.id;
}

export async function getQueueItems(): Promise<QueuedUpload[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function processQueue(): Promise<void> {
  const items = await getQueueItems();
  const pending = items.filter(
    (item) => item.status === "pending" || item.status === "failed"
  );

  for (const item of pending) {
    if (item.retryCount >= MAX_RETRIES) continue;

    try {
      // Update status to uploading
      await updateQueueItem(item.id, { status: "uploading" });

      await uploadMedia(
        item.file,
        item.tripId,
        item.stopId,
        item.caption,
        item.latitude,
        item.longitude
      );

      // Success — remove from queue
      await removeFromQueue(item.id);
    } catch (error) {
      // Mark as failed, increment retry
      await updateQueueItem(item.id, {
        status: "failed",
        retryCount: item.retryCount + 1,
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }
}

async function updateQueueItem(
  id: string,
  updates: Partial<QueuedUpload>
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const getRequest = store.get(id);
  getRequest.onsuccess = () => {
    const item = getRequest.result;
    if (item) {
      store.put({ ...item, ...updates });
    }
  };

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Auto-retry when coming back online
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("[UploadQueue] Back online — processing queue...");
    processQueue();
  });
}
