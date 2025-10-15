interface TrustChipProps {
  score: number;
}

export function TrustChip({ score }: TrustChipProps) {
  const getColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
    if (score >= 0.6) return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';

    return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
  };

  const percentage = Math.round(score * 100);

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getColor(score)}`}>
      Trust: {percentage}%
    </span>
  );
}

