interface ProcessingStatusProps {
  files: Array<{
    name: string;
    status: 'processing' | 'completed' | 'failed';
    progress: number;
    error?: string;
  }>;
}

export default function ProcessingStatus({ files }: ProcessingStatusProps) {
  const processingCount = files.filter(f => f.status === 'processing').length;
  const totalProgress = files.reduce((acc, file) => acc + file.progress, 0) / files.length;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
      <div className="flex items-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3" />
        <div>
          <p className="text-sm font-medium text-blue-900">
            Processing {processingCount} resume{processingCount !== 1 ? 's' : ''}...
          </p>
          <p className="text-xs text-blue-700">
            Extracting candidate information and analyzing skill matches
          </p>
        </div>
      </div>
      <div className="mt-3">
        <div className="bg-blue-200 rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300" 
            style={{ width: `${Math.min(100, totalProgress)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
