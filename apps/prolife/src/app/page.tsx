import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4">
          <span className="text-primary-600">ProLife</span> AI Agent
        </h1>
        <p className="text-lg text-gray-400 mb-8 max-w-xl">
          AI-powered distributor discovery, qualification, and outreach platform
          for ProLife Swiss Medical Technology.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
        >
          Open Dashboard
        </Link>
      </div>
    </main>
  );
}
