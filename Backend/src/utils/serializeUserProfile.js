export function serializeUserProfile(user, overrides = {}) {
  if (!user) return null;

  const source = typeof user.toObject === "function" ? user.toObject() : user;

  return {
    id: source._id?.toString?.() || source.id?.toString?.() || source.id || "",
    email: source.email || "",
    full_name: source.full_name || "",
    department_id: source.department_id || null,
    designation: source.designation || "",
    contact: source.contact || "",
    working_hours: source.working_hours || "",
    employee_id: source.employee_id || "",
    avatar_url: source.avatar_url || "",
    responsibilities: source.responsibilities || "",
    last_login: source.last_login || null,
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
    ...overrides,
  };
}
