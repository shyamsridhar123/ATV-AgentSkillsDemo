'use client';

import { useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { AlertTriangle, Shield, MapPin, Calendar, CreditCard, CheckCircle, X } from 'lucide-react';

interface FraudAlertCardProps {
  data: Record<string, unknown>;
}

export function FraudAlertCard({ data }: FraudAlertCardProps) {
  const [resolved, setResolved] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAction = (actionType: string) => {
    // Show confirmation for Block Card action - P0
    if (actionType === 'Block Card') {
      setShowBlockConfirm(true);
      return;
    }
    processAction(actionType);
  };

  const processAction = (actionType: string) => {
    setIsProcessing(true);
    setAction(actionType);
    setTimeout(() => {
      setResolved(true);
      setIsProcessing(false);
    }, 1000);
  };

  const confirmBlockCard = () => {
    setShowBlockConfirm(false);
    processAction('Block Card');
  };

  // Block Card Confirmation Modal - P0
  if (showBlockConfirm) {
    return (
      <div className="rich-card overflow-hidden border-red-200">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5" />
            <span className="font-semibold">Confirm Block Card</span>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-gray-700">
            Are you sure you want to block this card? You won&apos;t be able to make purchases until you request a new card.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowBlockConfirm(false)}
              className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmBlockCard}
              className="flex-1 px-4 py-2.5 text-white bg-red-600 rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              Block Card
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (resolved) {
    return (
      <div className="rich-card p-6 bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-emerald-800">Alert Resolved</p>
            <p className="text-sm text-emerald-600">
              {action === 'Block Card' 
                ? 'Your card has been blocked. A new one is on its way.'
                : action === 'Report as Fraud'
                ? 'We\'ve reported this as fraud and reversed the charge.'
                : 'Thanks for confirming. We\'ve updated your location history.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const riskLevel = data.riskLevel as string;
  const riskColor = riskLevel === 'high' ? 'red' : riskLevel === 'medium' ? 'amber' : 'yellow';
  const actions = data.actions as string[];

  return (
    <div className="rich-card overflow-hidden border-red-200">
      {/* Alert Header */}
      <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold">Suspicious Activity Detected</p>
            <p className="text-red-100 text-sm">Immediate attention required</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Risk Level Badge */}
        <div className="flex items-center justify-center">
          <span className={`px-4 py-1.5 rounded-full text-sm font-semibold bg-${riskColor}-100 text-${riskColor}-700 flex items-center gap-2`}>
            <Shield className="w-4 h-4" />
            {riskLevel.toUpperCase()} RISK
          </span>
        </div>

        {/* Transaction Details */}
        <div className="bg-red-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-sm text-red-600">{data.type as string}</p>
              <p className="text-xl font-bold text-red-700">{formatCurrency(data.amount as number)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-sm text-red-600">Location</p>
              <p className="font-medium text-red-700">{data.location as string}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-sm text-red-600">Date</p>
              <p className="font-medium text-red-700">{formatDate(data.date as string)}</p>
            </div>
          </div>
        </div>

        {/* Reason */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800">
            <strong>Why flagged:</strong> {data.reason as string}
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {actions.map((actionText) => {
            const isDestructive = actionText === 'Block Card' || actionText === 'Report as Fraud';
            return (
              <button
                key={actionText}
                onClick={() => handleAction(actionText)}
                className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  isDestructive
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {actionText === 'Block Card' && <CreditCard className="w-4 h-4" />}
                {actionText === 'Report as Fraud' && <AlertTriangle className="w-4 h-4" />}
                {actionText === 'This Was Me' && <CheckCircle className="w-4 h-4" />}
                {actionText}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 text-center">
          Transaction ID: {data.transactionId as string}
        </p>
      </div>
    </div>
  );
}
