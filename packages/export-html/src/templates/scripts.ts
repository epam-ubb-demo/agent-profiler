/**
 * Minimal vanilla JavaScript for HTML report interactivity.
 *
 * Features:
 * - Sortable tables (click header to sort)
 * - Collapsible sections (handled natively by <details>)
 * - Timeline zoom/pan (mouse wheel + drag)
 */

export function getScripts(): string {
  return `
(function() {
  'use strict';

  // ─── Sortable tables ────────────────────────────────────────────────────────
  document.querySelectorAll('table[data-sortable]').forEach(function(table) {
    var headers = table.querySelectorAll('th');
    headers.forEach(function(th, colIndex) {
      th.addEventListener('click', function() {
        var tbody = table.querySelector('tbody');
        if (!tbody) return;
        var rows = Array.from(tbody.querySelectorAll('tr'));
        var asc = th.getAttribute('data-sort-dir') !== 'asc';
        th.setAttribute('data-sort-dir', asc ? 'asc' : 'desc');

        // Reset other headers
        headers.forEach(function(h) {
          if (h !== th) h.removeAttribute('data-sort-dir');
        });

        rows.sort(function(a, b) {
          var cellA = a.children[colIndex];
          var cellB = b.children[colIndex];
          if (!cellA || !cellB) return 0;
          var valA = cellA.textContent || '';
          var valB = cellB.textContent || '';
          var numA = parseFloat(valA.replace(/[^0-9.\\-]/g, ''));
          var numB = parseFloat(valB.replace(/[^0-9.\\-]/g, ''));
          if (!isNaN(numA) && !isNaN(numB)) {
            return asc ? numA - numB : numB - numA;
          }
          return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });

        rows.forEach(function(row) { tbody.appendChild(row); });
      });
    });
  });

  // ─── Timeline zoom/pan ──────────────────────────────────────────────────────
  document.querySelectorAll('.timeline-container').forEach(function(container) {
    var svg = container.querySelector('svg');
    if (!svg) return;

    var scale = 1;
    var translateX = 0;
    var isDragging = false;
    var startX = 0;
    var startTranslateX = 0;

    function applyTransform() {
      svg.style.transform = 'translateX(' + translateX + 'px) scaleX(' + scale + ')';
      svg.style.transformOrigin = 'left center';
    }

    container.addEventListener('wheel', function(e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.max(0.5, Math.min(5, scale * delta));
      applyTransform();
    }, { passive: false });

    container.addEventListener('mousedown', function(e) {
      isDragging = true;
      startX = e.clientX;
      startTranslateX = translateX;
      container.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      translateX = startTranslateX + (e.clientX - startX);
      applyTransform();
    });

    document.addEventListener('mouseup', function() {
      isDragging = false;
      container.style.cursor = 'grab';
    });

    container.style.cursor = 'grab';
  });

  // ─── Expand/Collapse all ────────────────────────────────────────────────────
  document.querySelectorAll('[data-toggle-all]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var target = btn.getAttribute('data-toggle-all');
      var container = target ? document.querySelector(target) : document;
      if (!container) container = document;
      var details = container.querySelectorAll('details');
      var allOpen = Array.from(details).every(function(d) { return d.open; });
      details.forEach(function(d) { d.open = !allOpen; });
      btn.textContent = allOpen ? 'Expand All' : 'Collapse All';
    });
  });
})();
`;
}
