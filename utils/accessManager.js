const fs = require('fs');
const path = require('path');

const accessFilePath = path.resolve(__dirname, '../access.json');

function loadAccessData() {
  try {
    if (!fs.existsSync(accessFilePath)) {
      return {};
    }

    const raw = fs.readFileSync(accessFilePath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('[ACCESS] Failed to load access data:', error);
    return {};
  }
}

function saveAccessData(data) {
  try {
    fs.writeFileSync(accessFilePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[ACCESS] Failed to save access data:', error);
    return false;
  }
}

function getGuildAccess(guildId) {
  const data = loadAccessData();
  return data[guildId] || { roles: [], members: [] };
}

function setGuildAccess(guildId, accessData) {
  const data = loadAccessData();
  data[guildId] = accessData;
  return saveAccessData(data);
}

function addAllowedRole(guildId, roleId) {
  const access = getGuildAccess(guildId);
  if (!access.roles.includes(roleId)) {
    access.roles.push(roleId);
  }
  return setGuildAccess(guildId, access);
}

function removeAllowedRole(guildId, roleId) {
  const access = getGuildAccess(guildId);
  access.roles = access.roles.filter((id) => id !== roleId);
  return setGuildAccess(guildId, access);
}

function addAllowedMember(guildId, userId) {
  const access = getGuildAccess(guildId);
  if (!access.members.includes(userId)) {
    access.members.push(userId);
  }
  return setGuildAccess(guildId, access);
}

function removeAllowedMember(guildId, userId) {
  const access = getGuildAccess(guildId);
  access.members = access.members.filter((id) => id !== userId);
  return setGuildAccess(guildId, access);
}

function listAccessSettings(guildId) {
  return getGuildAccess(guildId);
}

function isMemberAllowed(member, guildId) {
  if (!member || !guildId) return false;
  const access = getGuildAccess(guildId);

  if (access.members.includes(String(member.id))) {
    return true;
  }

  const memberRoleIds = Array.from(member.roles.cache.keys());
  return memberRoleIds.some((roleId) => access.roles.includes(roleId));
}

module.exports = {
  addAllowedRole,
  removeAllowedRole,
  addAllowedMember,
  removeAllowedMember,
  listAccessSettings,
  isMemberAllowed,
};
