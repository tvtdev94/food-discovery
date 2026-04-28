import Link from "next/link";

export default function SharedNotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 flex flex-col items-center gap-6 text-center">
      <div className="text-5xl" aria-hidden="true">🍜</div>
      <h1 className="text-2xl font-bold text-foreground">Không tìm thấy link</h1>
      <p className="text-sm text-muted-foreground max-w-xs">
        Link chia sẻ này không tồn tại hoặc đã hết hạn.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
      >
        Về trang chủ →
      </Link>
    </main>
  );
}
