'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { CheckCircle, Clock, Zap, Edit2, AlertCircle, RefreshCw } from 'lucide-react';

interface TransferConfirmCardProps {
  data: Record<string, unknown>;
}

export function TransferConfirmCard({ data }: TransferConfirmCardProps) {
  const [status, setStatus] = useState<'pending' | 'processing' | 'confirmed' | 'cancelled' | 'error'>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConfirm = () => {
    setStatus('processing');
    setErrorMessage(null);
    
    // Simulate processing with possible error
    setTimeout(() => {
      // 10% chance of error for demo purposes
      if (Math.random() < 0.1) {
        setStatus('error');
        setErrorMessage('Unable to complete transfer. Please try again.');
      } else {
        setStatus('confirmed');
      }
    }, 1500);
  };

  const handleRetry = () => {
    setStatus('processing');
    setErrorMessage(null);
    
    setTimeout(() => {
      setStatus('confirmed');
    }, 1500);
  };

  const handleCancel = () => {
    setStatus('cancelled');
  };

  if (status === 'confirmed') {
    return (
      <div className="rich-card p-6 bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-emerald-800">Transfer Successful!</p>
            <p className="text-sm text-emerald-600">
              {formatCurrency(data.amount as number)} sent to {data.toContact as string}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'cancelled') {
    return (
      <div className="rich-card p-6 bg-gray-50 border-gray-200">
        <p className="text-gray-500 text-center">Transfer cancelled</p>
      </div>
    );
  }

  // Error state with retry - P1
  if (status === 'error') {
    return (
      <div className="rich-card p-6 bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-red-800">Transfer Failed</p>
            <p className="text-sm text-red-600">{errorMessage}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRetry}
            className="flex-1 px-4 py-2.5 text-white bg-indigo-600 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rich-card overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            <span className="font-semibold">Instant Transfer</span>
          </div>
          <span className="text-indigo-100 text-sm">⚡ {data.estimatedArrival as string}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Amount */}
        <div className="text-center">
          <p className="text-sm text-gray-500">Amount</p>
          <p className="text-3xl font-bold text-gray-900">
            {formatCurrency(data.amount as number)}
          </p>
        </div>

        {/* Transfer Details */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">From</span>
            <span className="text-sm font-medium text-gray-900">{String(data.fromAccount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">To</span>
            <span className="text-sm font-medium text-gray-900">{String(data.toContact)}</span>
          </div>
          {data.memo ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Memo</span>
              <span className="text-sm text-gray-700">{String(data.memo)}</span>
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            disabled={status === 'processing'}
            className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={status === 'processing'}
            className="flex-1 px-4 py-2.5 text-white bg-indigo-600 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'processing' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Confirm Transfer
              </>
            )}
          </button>
        </div>

        <button className="w-full text-sm text-indigo-600 hover:text-indigo-700 flex items-center justify-center gap-1">
          <Edit2 className="w-3 h-3" />
          Edit details
        </button>
      </div>
    </div>
  );
}
