/** Public support contact info. Override via frontend env vars in .env. */
export const support = {
  brand: "NovaBank",
  email: import.meta.env["VITE_SUPPORT_EMAIL"] ?? "support@novabank.dev",
  phone: import.meta.env["VITE_SUPPORT_PHONE"] ?? "1800-NOVABANK",
};
