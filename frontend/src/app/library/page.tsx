import { connection } from "next/server";
import Library from "./Library";

export default async function LibraryPage() {
  await connection();
  return <Library />;
}
