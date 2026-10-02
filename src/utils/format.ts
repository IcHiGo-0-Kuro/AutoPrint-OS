export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
export function formatINRCompact(amount: number): string { return `₹${amount.toFixed(2)}`; }
export function maskPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length >= 10) return `+91 ••••• ${cleaned.slice(-4)}`;
  return phone;
}
export function getLast4Phone(phone: string): string { return phone.replace(/\D/g, '').slice(-4) || 'XXXX'; }
export function generateTokenNumber(counter: number): string { return `X-${String(counter).padStart(4, '0')}`; }
export function calculatePlatformFee(printCost: number): number { return printCost < 10 ? 0.50 : 1.00; }
export function getFileIconColor(type: string): string {
  switch (type) {
    case 'pdf': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
    case 'docx': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    case 'pptx': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    default: return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
  }
}
