/** Loads Razorpay Checkout on demand, so pages that don't pay never download it. */
let loader = null;

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => {
      loader = null;
      reject(new Error('Could not load Razorpay. Check your internet connection.'));
    };
    document.body.appendChild(script);
  });
  return loader;
}
