import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <main id="main-content" className="grid min-h-screen place-items-center bg-canvas px-6">
      <div className="gt-card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-primary-50 text-primary">
          <FileQuestion className="h-5 w-5" aria-hidden />
        </div>
        <div className="tricolor-rule mx-auto mb-4 h-1 w-20 rounded-full" />
        <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-base text-slate-500">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-9 items-center rounded-btn bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
