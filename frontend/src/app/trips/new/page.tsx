import TripForm from "@/components/trips/TripForm";

export default function NewTripPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-text)] m-0">
          New Trip
        </h1>
        <p className="text-[var(--color-text-secondary)] text-sm mt-1">
          Create a new travel adventure
        </p>
      </div>

      <div className="glass rounded-2xl p-8">
        <TripForm />
      </div>
    </div>
  );
}
