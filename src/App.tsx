/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';

// IndexedDB helpers to persist user-selected video across refreshes
const DB_NAME = 'MainframeMediaDB';
const STORE_NAME = 'backgroundVideo';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveVideoToDB(blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, 'currentVideo');
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to save video to DB:', err);
  }
}

async function loadVideoFromDB(): Promise<Blob | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get('currentVideo');
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Custom typewriter hook
function useTypewriter(text: string, speed = 38, startDelay = 600) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    const timeoutId = setTimeout(() => {
      let currentIndex = 0;
      intervalId = setInterval(() => {
        currentIndex++;
        setDisplayed(text.slice(0, currentIndex));
        if (currentIndex >= text.length) {
          clearInterval(intervalId);
          setDone(true);
        }
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, speed, startDelay]);

  return { displayed, done };
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetTimeRef = useRef<number>(0);
  const isSeekingRef = useRef<boolean>(false);
  const prevXRef = useRef<number | null>(null);

  // Background video source
  const [videoSrc, setVideoSrc] = useState<string>('/background.mp4');
  const [isCustomVideo, setIsCustomVideo] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load persisted video if available
  useEffect(() => {
    loadVideoFromDB().then((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setVideoSrc(url);
        setIsCustomVideo(true);
      }
    });
  }, []);

  // Handle file selection (drag & drop or file dialog)
  const applyVideoFile = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('Please upload a video file (.mp4, .webm, .mov)');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setVideoSrc(objectUrl);
    setIsCustomVideo(true);
    setShowVideoModal(false);
    await saveVideoToDB(file);

    // Reset scrubber position
    targetTimeRef.current = 0.05;
    if (videoRef.current) {
      videoRef.current.currentTime = 0.05;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      applyVideoFile(e.dataTransfer.files[0]);
    }
  };

  // Typewriter hook for hero message
  const { displayed, done } = useTypewriter(
    'Glad you stopped in. Good taste tends to find us. Now, what are we building?',
    38,
    600
  );

  // Actions appear 400ms after page load, independent of typewriter
  useEffect(() => {
    const timer = setTimeout(() => {
      setActionsVisible(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Background video mouse-scrub controller
  useEffect(() => {
    const SENSITIVITY = 0.8;

    const handleMouseMove = (e: MouseEvent) => {
      const video = videoRef.current;
      if (!video || !video.duration || Number.isNaN(video.duration)) {
        prevXRef.current = e.clientX;
        return;
      }

      if (prevXRef.current === null) {
        prevXRef.current = e.clientX;
        return;
      }

      const delta = e.clientX - prevXRef.current;
      prevXRef.current = e.clientX;

      const timeOffset = (delta / window.innerWidth) * SENSITIVITY * video.duration;
      targetTimeRef.current = Math.min(
        Math.max(0, targetTimeRef.current + timeOffset),
        video.duration
      );

      if (!isSeekingRef.current) {
        isSeekingRef.current = true;
        video.currentTime = targetTimeRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const clientX = e.touches[0].clientX;
      const video = videoRef.current;
      if (!video || !video.duration || Number.isNaN(video.duration)) {
        prevXRef.current = clientX;
        return;
      }

      if (prevXRef.current === null) {
        prevXRef.current = clientX;
        return;
      }

      const delta = clientX - prevXRef.current;
      prevXRef.current = clientX;

      const timeOffset = (delta / window.innerWidth) * SENSITIVITY * video.duration;
      targetTimeRef.current = Math.min(
        Math.max(0, targetTimeRef.current + timeOffset),
        video.duration
      );

      if (!isSeekingRef.current) {
        isSeekingRef.current = true;
        video.currentTime = targetTimeRef.current;
      }
    };

    const resetPrevX = () => {
      prevXRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', resetPrevX);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', resetPrevX);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', resetPrevX);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', resetPrevX);
    };
  }, []);

  const handleSeeked = () => {
    const video = videoRef.current;
    if (!video) return;

    if (Math.abs(video.currentTime - targetTimeRef.current) > 0.02) {
      video.currentTime = targetTimeRef.current;
    } else {
      isSeekingRef.current = false;
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      targetTimeRef.current = 0.05;
      video.currentTime = 0.05;
    }
  };

  const handleCopyEmail = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText('hello@mainframe.co');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = 'hello@mainframe.co';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const whitePills = [
    { label: 'Pitch us an idea', href: 'mailto:hello@mainframe.co?subject=Pitch%20us%20an%20idea' },
    { label: 'Come work here', href: 'mailto:careers@mainframe.co?subject=Careers%20at%20Mainframe' },
    { label: 'Send a brief hello', href: 'mailto:hello@mainframe.co?subject=Hello' },
    { label: 'See how we operate', href: '#studio' },
  ];

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative min-h-screen min-h-[100dvh] w-full select-auto overflow-hidden text-white lg:text-black bg-[#339da2]"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {/* Hidden file input for video upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            applyVideoFile(e.target.files[0]);
          }
        }}
      />

      {/* Drag & Drop Visual Indicator Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md text-white transition-opacity duration-200">
          <div className="rounded-2xl border-2 border-dashed border-white/60 p-10 text-center max-w-md">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-white opacity-80 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-xl font-medium mb-1">Drop video to set background</p>
            <p className="text-sm text-white/70">Replaces and persists the scrubbing background video</p>
          </div>
        </div>
      )}

      {/* Background Video Layer */}
      <div className="fixed inset-0 z-0 h-full w-full min-h-[100dvh] overflow-hidden bg-[#339da2] pointer-events-none select-none">
        <video
          key={videoSrc}
          ref={videoRef}
          src={videoSrc}
          muted
          playsInline
          preload="auto"
          onSeeked={handleSeeked}
          onLoadedMetadata={handleLoadedMetadata}
          className="absolute inset-0 h-full w-full object-contain object-[50%_30%] md:object-[80%_50%] pointer-events-none"
        />
      </div>

      {/* NAVBAR (fixed, z-index: 10) */}
      <nav className="fixed top-0 left-0 right-0 z-10 flex w-full items-center justify-between px-5 sm:px-8 py-4 sm:py-5">
        {/* Logo (left) */}
        <div className="flex items-center gap-3">
          <span
            className="text-[21px] sm:text-[26px] tracking-tight text-white lg:text-black select-none"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Mainframe&reg;
          </span>
          <span
            className="select-none text-[25px] sm:text-[30px] text-white lg:text-black"
            style={{ letterSpacing: '-0.02em' }}
            aria-hidden="true"
          >
            ✳︎
          </span>
        </div>

        {/* Desktop nav links (center, hidden below md) */}
        <div className="hidden md:flex items-center text-[23px] text-white lg:text-black">
          <a href="#labs" className="hover:opacity-60 transition-opacity">
            Labs
          </a>
          <span>,&nbsp;</span>
          <a href="#studio" className="hover:opacity-60 transition-opacity">
            Studio
          </a>
          <span>,&nbsp;</span>
          <a href="#openings" className="hover:opacity-60 transition-opacity">
            Openings
          </a>
          <span>,&nbsp;</span>
          <a href="#shop" className="hover:opacity-60 transition-opacity">
            Shop
          </a>
        </div>

        {/* Desktop CTA (right, hidden below md) */}
        <div className="hidden md:block">
          <a
            href="mailto:hello@mainframe.co"
            className="text-[23px] text-white lg:text-black underline underline-offset-2 hover:opacity-60 transition-opacity"
          >
            Get in touch
          </a>
        </div>

        {/* Mobile hamburger (visible below md) */}
        <button
          type="button"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="md:hidden flex flex-col justify-center items-center gap-[5px] p-2 focus:outline-none cursor-pointer"
        >
          <span
            className={`w-6 h-[2px] bg-white lg:bg-black transition-all duration-300 ${
              mobileMenuOpen ? 'rotate-45 translate-y-[7px]' : ''
            }`}
          />
          <span
            className={`w-6 h-[2px] bg-white lg:bg-black transition-all duration-300 ${
              mobileMenuOpen ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <span
            className={`w-6 h-[2px] bg-white lg:bg-black transition-all duration-300 ${
              mobileMenuOpen ? '-rotate-45 -translate-y-[7px]' : ''
            }`}
          />
        </button>
      </nav>

      {/* Mobile overlay (z-index: 9) */}
      <div
        className={`fixed inset-0 z-[9] flex flex-col justify-center px-8 gap-8 bg-[#227b80]/98 backdrop-blur-md transition-opacity duration-300 md:hidden ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <a
          href="#labs"
          onClick={() => setMobileMenuOpen(false)}
          className="text-[32px] font-medium text-white hover:opacity-70 transition-opacity"
        >
          Labs
        </a>
        <a
          href="#studio"
          onClick={() => setMobileMenuOpen(false)}
          className="text-[32px] font-medium text-white hover:opacity-70 transition-opacity"
        >
          Studio
        </a>
        <a
          href="#openings"
          onClick={() => setMobileMenuOpen(false)}
          className="text-[32px] font-medium text-white hover:opacity-70 transition-opacity"
        >
          Openings
        </a>
        <a
          href="#shop"
          onClick={() => setMobileMenuOpen(false)}
          className="text-[32px] font-medium text-white hover:opacity-70 transition-opacity"
        >
          Shop
        </a>
        <a
          href="mailto:hello@mainframe.co"
          onClick={() => setMobileMenuOpen(false)}
          className="text-[32px] font-medium text-white underline underline-offset-4 hover:opacity-70 transition-opacity pt-4 border-t border-white/20"
        >
          Get in touch
        </a>
      </div>

      {/* HERO SECTION (z-index: 1) */}
      <main className="relative z-[1] flex min-h-[100dvh] h-screen flex-col justify-end pb-12 md:justify-center md:pb-0 px-5 sm:px-8 md:px-10 overflow-hidden">
        <div className="relative z-10 max-w-xl">
          {/* 1. Blurred intro label */}
          <div
            className="pointer-events-none select-none mb-5 sm:mb-6 text-white lg:text-black"
            style={{
              fontSize: 'clamp(18px, 4vw, 26px)',
              lineHeight: 1.3,
              fontWeight: 400,
              filter: 'blur(4px)',
            }}
          >
            Hey there, meet A.R.I.A,
            <br />
            Mainframe's Adaptive Response Interface Agent
          </div>

          {/* 2. Typewriter text */}
          <p
            className="text-white lg:text-black mb-5 sm:mb-6"
            style={{
              fontSize: 'clamp(18px, 4vw, 26px)',
              lineHeight: 1.35,
              fontWeight: 400,
              minHeight: '54px',
            }}
          >
            {displayed}
            {!done && (
              <span
                className="inline-block w-[2px] h-[1.1em] bg-white lg:bg-black align-middle ml-[2px] cursor-blink"
                aria-hidden="true"
              />
            )}
          </p>

          {/* 3. Action pill buttons */}
          <div
            className="flex flex-wrap gap-y-1"
            style={{
              opacity: actionsVisible ? 1 : 0,
              transform: actionsVisible ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}
          >
            {/* 4 white pill buttons */}
            {whitePills.map((pill) => (
              <a
                key={pill.label}
                href={pill.href}
                className="inline-flex items-center justify-center bg-white text-black border border-black/10 rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] whitespace-nowrap hover:bg-black hover:text-white transition-colors duration-200 cursor-pointer shadow-sm"
              >
                {pill.label}
              </a>
            ))}

            {/* 1 outline pill button */}
            <button
              type="button"
              onClick={handleCopyEmail}
              className="inline-flex items-center justify-center text-white bg-transparent border border-white rounded-full text-[13px] sm:text-[15px] px-4 sm:px-5 py-[0.3em] mx-[0.2em] mb-[0.4em] whitespace-nowrap gap-2 sm:gap-3 hover:bg-white hover:text-black transition-colors duration-200 cursor-pointer shadow-sm group relative"
              title="Click to copy email address"
            >
              <span>
                {copied ? (
                  'Email copied!'
                ) : (
                  <>
                    Reach us:{' '}
                    <span className="underline underline-offset-1">
                      hello@mainframe.co
                    </span>
                  </>
                )}
              </span>

              {/* 12x12 copy icon (inline SVG of two overlapping rectangles) */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="inline-block shrink-0"
                aria-hidden="true"
              >
                <rect
                  x="3.5"
                  y="3.5"
                  width="7"
                  height="7"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M2.5 8.5H1.5C1.22386 8.5 1 8.27614 1 8V1.5C1 1.22386 1.22386 1 1.5 1H8C8.27614 1 8.5 1.22386 8.5 1.5V2.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </main>

      {/* Discreet Video Replacement Control (bottom-right) */}
      <div className="fixed bottom-4 right-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowVideoModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-normal tracking-wide rounded-full bg-black/60 text-white backdrop-blur-md border border-white/20 hover:bg-black transition-all cursor-pointer shadow-lg"
          title="Replace or load background video"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>{isCustomVideo ? 'Change Video' : 'Load Video'}</span>
        </button>
      </div>

      {/* Video Switcher Dialog Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl text-black border border-black/10">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-black/10">
              <h3 className="text-lg font-medium">Replace Background Video</h3>
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className="text-black/50 hover:text-black cursor-pointer p-1"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-black/60 mb-4">
              Select or drop your video file (such as your KlingAI animation). It will scrub smoothly with horizontal mouse movement and persist in your browser.
            </p>

            {/* File upload button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-black/20 hover:border-black/50 rounded-xl p-6 text-center cursor-pointer transition-colors bg-black/[0.02] hover:bg-black/[0.04] mb-4"
            >
              <svg className="w-8 h-8 mx-auto mb-2 text-black/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium">Click to choose video file</p>
              <p className="text-xs text-black/50 mt-1">or drag and drop it anywhere onto the page</p>
            </div>

            {/* URL input */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-black/70 mb-1">Or paste a video URL:</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://.../video.mp4"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-black/20 focus:outline-none focus:border-black"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (urlInput.trim()) {
                      setVideoSrc(urlInput.trim());
                      setIsCustomVideo(true);
                      setShowVideoModal(false);
                      if (videoRef.current) {
                        videoRef.current.currentTime = 0.05;
                      }
                    }
                  }}
                  className="px-3 py-1.5 text-xs bg-black text-white rounded-lg hover:bg-black/80 transition-colors cursor-pointer"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Actions footer */}
            <div className="flex items-center justify-between pt-2 border-t border-black/10 text-xs">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const db = await openDB();
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    tx.objectStore(STORE_NAME).delete('currentVideo');
                  } catch (err) {
                    console.warn(err);
                  }
                  setVideoSrc('/background.mp4');
                  setIsCustomVideo(false);
                  setShowVideoModal(false);
                }}
                className="text-black/50 hover:text-black underline cursor-pointer"
              >
                Reset to default
              </button>

              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className="px-4 py-1.5 bg-black text-white rounded-lg text-xs hover:bg-black/80 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
