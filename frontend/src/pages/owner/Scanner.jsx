import { AnimatePresence, motion } from 'framer-motion';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  FileImage,
  FolderOpen,
  ImagePlus,
  Keyboard,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import { dateShort, inr, time12 } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Input } from '@/components/ui/Field';
import { StatusActions } from './BookingRequests';

const READER_ID = 'hev-qr-reader';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** QR payload is JSON with booking_id; accept a bare UUID too (manual entry). */
function extractBookingId(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.booking_id) return String(parsed.booking_id);
  } catch {
    /* not JSON */
  }
  return text.match(UUID_RE)?.[0] || null;
}

export default function Scanner() {
  const scanner = useRef(null);
  const fileInputRef = useRef(null);
  const handling = useRef(false);

  const [mode, setMode] = useState('file'); // Default to file upload for desktop/laptop convenience
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState(null); // { valid, booking?, error? }
  const [verifying, setVerifying] = useState(false);

  // File browser states
  const [filePreview, setFilePreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [processingFile, setProcessingFile] = useState(false);

  const stop = useCallback(async () => {
    const s = scanner.current;
    scanner.current = null;
    setScanning(false);
    if (s) {
      try {
        await s.stop();
        s.clear();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  useEffect(() => () => void stop(), [stop]);

  const verify = useCallback(
    async (raw) => {
      const id = extractBookingId(raw.trim());
      if (!id) {
        setResult({ valid: false, error: "This QR code isn't a valid HapticEV booking." });
        return;
      }
      setVerifying(true);
      try {
        const res = await endpoints.verifyQr(id);
        setResult(res);
        if (navigator.vibrate) navigator.vibrate(80);
      } catch (err) {
        setResult({ valid: false, error: err.message });
      } finally {
        setVerifying(false);
      }
    },
    [],
  );

  // Live Camera Scan
  const startCamera = async () => {
    setResult(null);
    setFilePreview(null);
    handling.current = false;
    try {
      const s = new Html5Qrcode(READER_ID, { verbose: false });
      scanner.current = s;
      setScanning(true);
      await s.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
        async (text) => {
          if (handling.current) return;
          handling.current = true;
          await stop();
          verify(text);
        },
        () => {},
      );
    } catch (err) {
      setScanning(false);
      scanner.current = null;
      toast.error(String(err).includes('Permission') ? 'Camera permission denied' : 'Could not start the camera');
    }
  };

  // QR Code Image File Upload & Decoding
  const scanQrFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, WebP, etc.)');
      return;
    }

    await stop();
    setProcessingFile(true);
    const previewUrl = URL.createObjectURL(file);
    setFilePreview(previewUrl);
    setResult(null);

    try {
      const html5QrCode = new Html5Qrcode(READER_ID, { verbose: false });
      const decodedText = await html5QrCode.scanFile(file, false);
      toast.success('QR Code detected successfully!');
      await verify(decodedText);
      try {
        html5QrCode.clear();
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.warn('QR file scan error:', err);
      toast.error('Could not detect a QR code in this image. Make sure the QR is clear and well-lit.');
      setResult({
        valid: false,
        error: 'No readable QR code found in this image. Please upload a clear photo/screenshot or enter the booking ID manually below.',
      });
    } finally {
      setProcessingFile(false);
    }
  };

  // Drag and drop handlers
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) scanQrFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // Clipboard paste listener (Ctrl+V screenshots from clipboard)
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setMode('file');
            scanQrFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const b = result?.booking;

  return (
    <div>
      <PageHeader
        eyebrow="Station Check-in"
        title="Verify Booking QR Code"
        description="Upload a QR code image/screenshot from your computer, scan with your camera, or enter the booking ID manually."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          {/* Mode Switcher */}
          <div className="mb-5 flex rounded-xl border border-line bg-ink-900/60 p-1">
            <button
              type="button"
              onClick={async () => {
                await stop();
                setMode('file');
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                mode === 'file'
                  ? 'border border-amber-500/30 bg-amber-500/15 text-amber-300 shadow-sm'
                  : 'text-neutral-400 hover:text-bone'
              }`}
            >
              <UploadCloud className="size-4" /> Upload QR File
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('camera');
                setFilePreview(null);
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                mode === 'camera'
                  ? 'border border-amber-500/30 bg-amber-500/15 text-amber-300 shadow-sm'
                  : 'text-neutral-400 hover:text-bone'
              }`}
            >
              <Camera className="size-4" /> Live Camera
            </button>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                scanQrFile(e.target.files[0]);
              }
              e.target.value = '';
            }}
          />

          {/* ── Mode 1: File Browser / Upload ── */}
          {mode === 'file' ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`relative mx-auto flex aspect-square w-full max-w-md flex-col items-center justify-center overflow-hidden rounded-2xl border-2 transition ${
                isDragOver
                  ? 'border-amber-400 bg-amber-500/15 ring-4 ring-amber-500/20'
                  : filePreview
                  ? 'border-line bg-ink-900'
                  : 'border-dashed border-line bg-ink-900/50 hover:border-amber-500/50 hover:bg-ink-900/80'
              }`}
            >
              {/* Invisible anchor for Html5Qrcode reader */}
              <div id={READER_ID} className="pointer-events-none absolute -left-[9999px] size-1 opacity-0" />

              {filePreview ? (
                <div className="relative size-full">
                  <img src={filePreview} alt="Uploaded QR" className="size-full object-contain p-4" />
                  {processingFile && (
                    <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2 text-amber-400">
                        <RefreshCw className="size-8 animate-spin" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-bone">
                          Decoding QR Code…
                        </span>
                      </div>
                    </div>
                  )}
                  {!processingFile && (
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 rounded-xl border border-line bg-ink-950/80 p-2.5 backdrop-blur-md">
                      <span className="flex items-center gap-1.5 truncate text-xs text-neutral-300">
                        <FileImage className="size-4 shrink-0 text-amber-400" />
                        <span className="truncate">Uploaded Image</span>
                      </span>
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose another
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-inner">
                    <UploadCloud className="size-8" />
                  </div>
                  <h3 className="font-semibold text-bone">Upload or Drop QR Code Image</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
                    Browse an image file from your PC or paste with <kbd className="rounded border border-line bg-ink-800 px-1 py-0.5 text-[10px] font-mono text-amber-300">Ctrl+V</kbd>
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500">Supports PNG, JPG, WebP screenshots</p>

                  <div className="mt-6 flex justify-center gap-3">
                    <Button
                      variant="primary"
                      onClick={() => fileInputRef.current?.click()}
                      loading={processingFile || verifying}
                    >
                      <FolderOpen className="size-4" /> Browse Image File
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Mode 2: Camera Viewfinder ── */
            <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl border border-line bg-ink-900">
              <div id={READER_ID} className="absolute inset-0 [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />
              {!scanning && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <ScanLine className="mx-auto size-16 text-neutral-600" />
                    <p className="mt-3 text-sm text-neutral-500">Camera is off</p>
                  </div>
                </div>
              )}
              {scanning && (
                <>
                  <div className="pointer-events-none absolute inset-[15%]">
                    {[
                      'left-0 top-0 border-l-2 border-t-2',
                      'right-0 top-0 border-r-2 border-t-2',
                      'bottom-0 left-0 border-b-2 border-l-2',
                      'bottom-0 right-0 border-b-2 border-r-2',
                    ].map((c) => (
                      <span key={c} className={`absolute size-8 rounded-sm border-amber-400 ${c}`} />
                    ))}
                    <motion.span
                      className="absolute inset-x-0 h-0.5 bg-amber-400 shadow-[0_0_16px_2px_rgba(245,173,63,0.8)]"
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Camera Controls (if camera mode) */}
          {mode === 'camera' && (
            <div className="mt-5 flex items-center justify-center gap-3">
              {scanning ? (
                <Button variant="secondary" onClick={stop}>
                  <CameraOff className="size-4" /> Stop camera
                </Button>
              ) : (
                <Button onClick={startCamera} loading={verifying}>
                  <Camera className="size-4" /> {result ? 'Scan another' : 'Start camera scan'}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  stop();
                  setMode('file');
                  fileInputRef.current?.click();
                }}
              >
                <FolderOpen className="size-4" /> Or upload file
              </Button>
            </div>
          )}

          {/* Manual ID verification fallback */}
          <form
            className="mt-6 flex gap-2 border-t border-line pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) verify(manual);
            }}
          >
            <div className="relative flex-1">
              <Keyboard className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
              <Input
                withIcon
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Or paste the booking ID manually"
              />
            </div>
            <Button type="submit" variant="secondary" loading={verifying} disabled={!manual.trim()}>
              Verify
            </Button>
          </form>
        </Card>

        {/* ── Right Column: Verification Result & Actions ── */}
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass grid place-items-center rounded-2xl p-10 text-center text-sm text-neutral-500"
            >
              <div>
                <ScanLine className="mx-auto size-12 text-neutral-600" />
                <p className="mt-3 font-medium text-neutral-400">Awaiting QR scan or file upload</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Upload a ticket image or scan with camera to see booking details.
                </p>
              </div>
            </motion.div>
          ) : !result.valid ? (
            <motion.div
              key="bad"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1, x: [0, -8, 8, -4, 0] }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 p-10 text-center"
            >
              <ShieldAlert className="size-12 text-rose-300" />
              <h2 className="mt-4 text-xl uppercase">Invalid Ticket</h2>
              <p className="mt-2 max-w-sm text-sm text-neutral-300">
                {result.error || 'Booking not found for your stations.'}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-6"
                onClick={() => {
                  setResult(null);
                  setFilePreview(null);
                }}
              >
                Try Another Scan
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Card className="overflow-hidden p-0">
                <div className="flex items-center gap-3 border-b border-amber-400/20 bg-amber-500/10 p-5">
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                  >
                    <ShieldCheck className="size-8 text-amber-300" />
                  </motion.span>
                  <div className="flex-1">
                    <p className="font-semibold text-bone">Valid Booking Verified</p>
                    <p className="font-mono text-xs text-neutral-400">
                      {String(b.booking_id).slice(0, 18)}…
                    </p>
                  </div>
                  <Badge status={b.status} />
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-6 text-sm">
                  <Item label="Driver" value={b.full_name} />
                  <Item label="Phone" value={b.phone} />
                  <Item
                    label="Vehicle"
                    value={[b.vehicle_number, b.vehicle_type].filter(Boolean).join(' · ') || '—'}
                  />
                  <Item
                    label="Paid"
                    value={`${inr(b.amount_paid, { decimals: 2 })} · ${b.payment_status}`}
                  />
                  <Item label="Station" value={b.station?.name} />
                  <Item
                    label="Slot"
                    value={`${dateShort(b.slot?.date)}, ${time12(b.slot?.start_time)} – ${time12(
                      b.slot?.end_time,
                    )}`}
                  />
                </dl>

                {/* Earnings & Commission pill */}
                {b.amount_paid > 0 && (
                  <div className="mx-6 mb-4 rounded-xl border border-line bg-ink-900/50 p-3 text-xs">
                    {Number(b.commission_amount || 0) > 0 ? (
                      <div className="flex items-center justify-between text-neutral-400">
                        <span>Platform Fee (5%): <b className="text-amber-400">-{inr(b.commission_amount)}</b></span>
                        <span>Net Payout: <b className="text-emerald-400">{inr(b.owner_earnings)}</b></span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-neutral-400">
                        <span className="text-emerald-300">✓ 0% Platform Fee (Membership Active)</span>
                        <span>Net Payout: <b className="text-emerald-400">{inr(b.owner_earnings || b.amount_paid)}</b></span>
                      </div>
                    )}
                  </div>
                )}

                <div className="border-t border-line p-6">
                  <StatusActions
                    booking={b}
                    size="md"
                    onChanged={(nb) => setResult((r) => ({ ...r, booking: nb }))}
                  />
                  {['completed', 'cancelled', 'rejected'].includes(b.status) && (
                    <p className="mt-3 text-xs text-neutral-400">
                      No further action needed for this booking.
                    </p>
                  )}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-bone">{value}</dd>
    </div>
  );
}
