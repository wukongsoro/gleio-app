export function PrintStyles() {
  return (
    <style>
      {`
        @media print {
          /* hide UI chrome */
          button, .no-print {
            display: none !important;
          }

          /* optimize page layout */
          body {
            margin: 0;
            padding: 20px;
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
            background: #fff;
          }

          /* prevent page breaks inside elements */
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid;
            page-break-inside: avoid;
          }

          p, li {
            page-break-inside: avoid;
          }

          /* add page numbers */
          @page {
            margin: 1in;
            @bottom-right {
              content: "Page " counter(page) " of " counter(pages);
            }
          }

          /* header/footer */
          @page :first {
            @top-center {
              content: "Research Report";
              font-size: 14pt;
              font-weight: bold;
            }
          }

          /* force black text and remove backgrounds */
          * {
            color: #000 !important;
            background: transparent !important;
            box-shadow: none !important;
            text-shadow: none !important;
          }

          /* show links */
          a[href]:after {
            content: " (" attr(href) ")";
            font-size: 90%;
            color: #666 !important;
          }

          /* improve citation visibility */
          sup {
            color: #0066cc !important;
            font-weight: bold;
          }
        }
      `}
    </style>
  );
}

