// src/components/layout/Footer.jsx

export default function Footer() {
  return (
    <footer className="py-4 text-center text-sm text-base-content/60">
      © {new Date().getFullYear()} TopLine Education. Developed by{" "}
      <span className="font-medium text-primary">Jihadur Rahman Noyon</span>
    </footer>
  );
}
