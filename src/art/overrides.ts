// 内容包图片：按键名替换或补充美术（头像、物品图标、插图、标题背景）。规范见 docs/CONTENT_GUIDE.md「图片」
const imgs = new Map<string, HTMLImageElement>();

export function setImage(key: string, img: HTMLImageElement) { imgs.set(key, img); }
export function getImage(key: string | undefined | null): HTMLImageElement | undefined {
  if (!key) return undefined;
  const i = imgs.get(key);
  return i && i.complete && i.naturalWidth ? i : undefined;
}
export const imageKeys = () => [...imgs.keys()];
