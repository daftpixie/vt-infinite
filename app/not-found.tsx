import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap">
      <h1>Not found</h1>
      <p>There is no page at this address.</p>
      <p>
        <Link href="/">Go to the home page</Link>
      </p>
    </div>
  );
}
