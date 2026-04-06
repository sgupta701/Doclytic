export const buildEmployeeId = (userId) => {
  const rawId = userId?.toString?.() || String(userId || "");
  return `EMP-${rawId.slice(-6).toUpperCase()}`;
};

export const ensureEmployeeId = async (user) => {
  if (!user) return null;
  if (user.employee_id) return user;

  user.employee_id = buildEmployeeId(user._id || user.id);
  await user.save();
  return user;
};
