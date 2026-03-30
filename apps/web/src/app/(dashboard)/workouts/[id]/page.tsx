'use client';

interface WorkoutDetailPageProps {
  params: { id: string };
}

export default function WorkoutDetailPage({ params }: WorkoutDetailPageProps) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Workout {params.id}</h1>
      <p className="text-gray-500">Workout detail view — coming soon.</p>
    </div>
  );
}
