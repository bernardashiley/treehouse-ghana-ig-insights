import json
from pathlib import Path


project = Path.cwd()

# Resolve the client data prefix from config so this works for any client.
config_path = project / "config" / "client.config.json"
prefix = "client"
if config_path.exists():
    with open(config_path, "r", encoding="utf-8-sig") as f:
        cfg = json.load(f)
    c = cfg.get("client", {})
    prefix = c.get("data_prefix") or c.get("short_name") or c.get("handle") or "client"

posts_path = project / "data" / "raw" / f"{prefix}_posts_full.json"

if not posts_path.exists():
    raise SystemExit(
        f"Missing posts data: {posts_path}. Run the posts scrape first."
    )


def safe_number(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0


def get_instagram_url(post):
    for key in ["url", "postUrl"]:
        value = post.get(key)
        if isinstance(value, str) and "instagram.com" in value:
            clean = value.split("?")[0]
            if "/p/" in clean or "/reel/" in clean:
                return clean

    shortcode = post.get("shortCode") or post.get("shortcode")
    post_type = str(post.get("type") or post.get("productType") or "").lower()

    if shortcode:
        if "reel" in post_type:
            return f"https://www.instagram.com/reel/{shortcode}/"
        return f"https://www.instagram.com/p/{shortcode}/"

    return None


def score_post(post):
    likes = safe_number(post.get("likesCount"))
    comments = safe_number(post.get("commentsCount"))
    views = max(
        safe_number(post.get("videoViewCount")),
        safe_number(post.get("videoPlayCount")),
    )

    return (comments * 5) + likes + (views * 0.01)


with open(posts_path, "r", encoding="utf-8-sig") as f:
    posts = json.load(f)

if isinstance(posts, dict):
    posts = [posts]

ranked_posts = sorted(posts, key=score_post, reverse=True)

urls = []
seen = set()

for post in ranked_posts:
    url = get_instagram_url(post)

    if url and url not in seen:
        seen.add(url)
        urls.append(url)

    if len(urls) >= 25:
        break

if not urls:
    raise SystemExit("No usable Instagram post/reel URLs found in the posts data.")

processed_dir = project / "data" / "processed"
inputs_dir = project / "inputs"

processed_dir.mkdir(parents=True, exist_ok=True)
inputs_dir.mkdir(parents=True, exist_ok=True)

top_urls_path = processed_dir / "top_post_urls.txt"
comments_input_path = inputs_dir / "comments_top_posts.json"

top_urls_path.write_text("\n".join(urls), encoding="utf-8")

payload = {
    "resultsType": "comments",
    "directUrls": urls,
    "resultsLimit": 50,
}

comments_input_path.write_text(
    json.dumps(payload, indent=2, ensure_ascii=False),
    encoding="utf-8",
)

print(f"Source posts file: {posts_path}")
print(f"Saved {len(urls)} URLs to: {top_urls_path}")
print(f"Saved comments input to: {comments_input_path}")
print("\nFirst URLs:")
for url in urls[:5]:
    print(url)