export default function Footer() {
  return (
    <footer className="border-t border-base-300/70 bg-base-100 px-4 py-5">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-2 text-center sm:flex-row sm:gap-3">
        <p className="text-xs text-base-content/50 sm:text-sm">
          © {new Date().getFullYear()} TopLine Education.
        </p>

        <span className="hidden h-1 w-1 rounded-full bg-base-content/30 sm:block" />

        <p className="text-xs text-base-content/50 sm:text-sm">
          Developed by{" "}
          <a
            href="https://jihadur.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary transition-colors hover:underline"
          >
            Jihadur Rahman Noyon
          </a>
        </p>
      </div>
    </footer>
  );
}
