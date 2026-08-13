import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("search", "routes/search.tsx"),
  route("materials/:familySlug", "routes/materials.$familySlug.tsx"),
  route("brands/:brandSlug", "routes/brands.$brandSlug.tsx"),
] satisfies RouteConfig;
