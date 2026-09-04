function truncateText(value, maxLength = 1000) {
  if (!value) {
    return "(なし)";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function formatUser(user) {
  if (!user) {
    return "Unknown";
  }

  if (!user.tag && !user.username && user.id) {
    return `Unknown (${user.id})`;
  }

  return `${user.tag ?? user.username} (${user.id})`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

module.exports = {
  formatDuration,
  formatUser,
  truncateText,
};
