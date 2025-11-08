module.exports = {
    name: "h",
    description: "Help command for team",
    execute(message, args) {
        if (args[0] === "test") {
            // מוצא את הרול וצובע אותו
            const teamRole = message.guild.roles.cache.find(role => role.name === "צוות");
            if (teamRole) {
                message.channel.send(`${teamRole} צוות, יש קריאה לעזרה! 🆘`);
            } else {
                message.channel.send("לא נמצא רול בשם 'צוות'");
            }
        } else {
            message.channel.send("שימוש לא נכון. נסה !h test");
        }
    }
};
