import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type WikiPage } from "../lib/api";
import { useAuthStore } from "../stores/auth";

export function WikiListPage() {
  const user = useAuthStore((s) => s.user);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get("category") || "";
  const searchQuery = searchParams.get("search") || "";

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.wiki.list({ category: activeCategory || undefined, search: searchQuery || undefined }),
      fetch("/api/v1/wiki/categories").then((r) => r.json()),
    ]).then(([data, catData]) => {
      setPages(data.pages);
      setCategories(catData.categories || []);
      setLoading(false);
    });
  }, [activeCategory, searchQuery]);

  const groupedByCategory = pages.reduce<Record<string, WikiPage[]>>((acc, page) => {
    if (!acc[page.category]) acc[page.category] = [];
    acc[page.category].push(page);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Wiki</h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => {
              const sp = new URLSearchParams(searchParams);
              if (e.target.value) sp.set("search", e.target.value);
              else sp.delete("search");
              setSearchParams(sp);
            }}
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56"
          />
          {user && (
            <Link
              to="/wiki/new"
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              New page
            </Link>
          )}
        </div>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => {
            const sp = new URLSearchParams(searchParams);
            sp.delete("category");
            setSearchParams(sp);
          }}
          className={`px-3 py-1 rounded-full text-sm ${
            !activeCategory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              const sp = new URLSearchParams(searchParams);
              sp.set("category", cat);
              setSearchParams(sp);
            }}
            className={`px-3 py-1 rounded-full text-sm capitalize ${
              activeCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse h-16 bg-muted rounded-lg" />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No pages found.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByCategory)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, catPages]) => (
              <div key={category}>
                <h2 className="text-lg font-semibold capitalize mb-3">{category}</h2>
                <div className="grid gap-2">
                  {catPages
                    .sort((a, b) => a.title.localeCompare(b.title))
                    .map((page) => (
                      <Link
                        key={page.id}
                        to={`/wiki/${page.slug}`}
                        className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                      >
                        <span className="font-medium">{page.title}</span>
                        <span className="text-xs text-muted-foreground">
                          v{page.currentVersion}
                        </span>
                      </Link>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
