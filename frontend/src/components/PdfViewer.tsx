
import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./PdfViewer.css";

// Configure PDF.js to load its worker through Vite.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PdfViewerProps {
  fileUrl: string | null;
  filename: string;
  loading?: boolean;
  error?: string | null;
}

export default function PdfViewer({
  fileUrl,
  filename,
  loading = false,
  error = null,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);

  // Reset navigation and zoom when a different PDF is opened.
  useEffect(() => {
    setPageNumber(1);
    setNumPages(0);
    setScale(1);
  }, [fileUrl]);

  // Called after PDF.js successfully reads the document.
  function handleLoadSuccess({
    numPages: totalPages,
  }: {
    numPages: number;
  }) {
    setNumPages(totalPages);
    setPageNumber(1);
  }

  function handleLoadError() {
    setNumPages(0);
  }

  function goToPreviousPage() {
    setPageNumber((current) => Math.max(1, current - 1));
  }

  function goToNextPage() {
    setPageNumber((current) => Math.min(numPages, current + 1));
  }

  function zoomIn() {
    setScale((current) => Math.min(2, current + 0.2));
  }

  function zoomOut() {
    setScale((current) => Math.max(0.6, current - 0.2));
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-filename" title={filename}>
          <span className="pdf-file-icon">▤</span>
          <span>{filename}</span>
        </div>

        {fileUrl && !loading && !error && numPages > 0 && (
          <div className="pdf-controls">
            <div className="pdf-page-controls">
              <button
                type="button"
                onClick={goToPreviousPage}
                disabled={pageNumber <= 1}
                aria-label="Previous page"
              >
                ‹
              </button>

              <span>
                {pageNumber} / {numPages}
              </span>

              <button
                type="button"
                onClick={goToNextPage}
                disabled={pageNumber >= numPages}
                aria-label="Next page"
              >
                ›
              </button>
            </div>

            <div className="pdf-zoom-controls">
              <button
                type="button"
                onClick={zoomOut}
                disabled={scale <= 0.6}
                aria-label="Zoom out"
              >
                −
              </button>

              <span>{Math.round(scale * 100)}%</span>

              <button
                type="button"
                onClick={zoomIn}
                disabled={scale >= 2}
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pdf-canvas-area">
        {loading ? (
          <div className="pdf-state">
            <div className="pdf-spinner" />
            <h3>Loading document...</h3>
            <p>Please wait while we prepare your PDF.</p>
          </div>
        ) : error ? (
          <div className="pdf-state pdf-error">
            <div className="pdf-state-icon">!</div>
            <h3>Unable to open document</h3>
            <p>{error}</p>
          </div>
        ) : fileUrl ? (
          <Document
            file={fileUrl}
            onLoadSuccess={handleLoadSuccess}
            onLoadError={handleLoadError}
            loading={
              <div className="pdf-state">
                <div className="pdf-spinner" />
                <h3>Rendering PDF...</h3>
              </div>
            }
            error={
              <div className="pdf-state pdf-error">
                <h3>PDF rendering failed</h3>
                <p>The document may be damaged or unsupported.</p>
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        ) : (
          <div className="pdf-state">
            <div className="pdf-state-icon">▤</div>
            <h3>No document selected</h3>
            <p>Select a PDF document to preview it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
