'use client';

import React from 'react';
import Link from 'next/link';
import TennisVideoAnalysis from '@/components/TennisVideoAnalysis';

export default function TennisVideoAnalysisPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/tennis" className="text-blue-500 hover:underline flex items-center gap-2">
            <span>←</span> Back to Tennis
          </Link>
        </div>
        
        <TennisVideoAnalysis />
      </div>
    </div>
  );
} 