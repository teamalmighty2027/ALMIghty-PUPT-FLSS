// Applies custom brand coloring and styles to Sienna accessibility widget
window.addEventListener('load', () => {

  setTimeout(() => {
    const widget = document.querySelector('sienna-accessibility-widget');

    if (widget && widget.shadowRoot) {
      const style = document.createElement('style');
      style.textContent = `
        .sienna-btn {
          background-color: #800000 !important;
        }
        .sienna-icon {
          fill: white !important;
        }
      `;
      widget.shadowRoot.appendChild(style);
    }
  }, 1000);

});
