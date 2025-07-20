export async function getBrandReviews(brandId: string) {
  // Map brandId to file name
  const fileMap: Record<string, string> = {
    "bbx-brand": "bbxbrand.json",
    "murci": "murci.json",
    "odd-muse": "oddmuse.json",
    "wander-doll": "wanderdoll.json",
    "because-of-alice": "becauseofalice.json",
  };

  const fileName = fileMap[brandId];
  if (!fileName) return [];

  const res = await fetch(`/${fileName}`);
  if (!res.ok) return [];
  return res.json();
} 