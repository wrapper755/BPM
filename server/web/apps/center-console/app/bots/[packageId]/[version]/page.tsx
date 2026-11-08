import { PackageDetail } from "@/app/packages/[packageId]/[version]/page";

/** CON-02 프로세스 상세 — 「운영 현황 › 프로세스」 아래. 그리는 것은 CON-06 상세와 같은 함수다. */
export default async function ProcessPage({
  params,
}: {
  params: Promise<{ packageId: string; version: string }>;
}) {
  return <PackageDetail params={await params} area="process" />;
}
