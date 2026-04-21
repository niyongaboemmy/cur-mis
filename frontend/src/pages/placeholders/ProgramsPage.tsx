import { BookOpen, Construction } from "lucide-react";

export default function ProgramsPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700 select-none">
      <div className="w-20 h-20 bg-primary-50 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400 mb-6 animate-bounce">
        <BookOpen size={40} />
      </div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Academic Programs
      </h1>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        Course catalog and curriculum management modules are under development.
      </p>
      <div className="mt-8 flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-full text-sm font-medium border border-yellow-100 dark:border-yellow-900/30">
        <Construction size={16} />
        Under Construction
      </div>
    </div>
  );
}
