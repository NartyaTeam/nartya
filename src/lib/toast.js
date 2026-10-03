import { toast as toastify } from "react-toastify";
import { platform } from "@/platform/index.js";

const MOBILE_AUTO_CLOSE = 2600;
let mobileToastId = null;
let mobileToastSequence = 0;

function showToast(type, content, options = {}) {
  if (!platform.isMobile) {
    const method = type ? toastify[type] : toastify;
    return method(content, options);
  }

  const nextOptions = {
    ...options,
    autoClose: options.autoClose ?? MOBILE_AUTO_CLOSE,
  };

  // Sur mobile, un nouveau message remplace l'ancien au lieu de s'empiler.
  if (mobileToastId && toastify.isActive(mobileToastId)) {
    toastify.update(mobileToastId, {
      ...nextOptions,
      render: content,
      type: type || "default",
    });
    return mobileToastId;
  }

  if (mobileToastId) toastify.dismiss(mobileToastId);
  mobileToastId = `nartya-mobile-feedback-${++mobileToastSequence}`;

  return toastify(content, {
    ...nextOptions,
    type: type || "default",
    toastId: mobileToastId,
  });
}

export const toast = Object.assign(
  (content, options) => showToast(null, content, options),
  {
    success: (content, options) => showToast("success", content, options),
    info: (content, options) => showToast("info", content, options),
    warn: (content, options) => showToast("warning", content, options),
    warning: (content, options) => showToast("warning", content, options),
    error: (content, options) => showToast("error", content, options),
    dismiss: (...args) => toastify.dismiss(...args),
    isActive: (...args) => toastify.isActive(...args),
    update: (...args) => toastify.update(...args),
  },
);
