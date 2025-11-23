module.exports = {
    name: "createmute",
    description: "יוצר רול Muted עם הרשאות חסימה בכל הערוצים",

    async execute(message, args, client) {
        if (!message.member.permissions.has("Administrator")) {
            return message.reply("❌ רק אדמין יכול להשתמש בפקודה הזו.");
        }

        const guild = message.guild;

        // בדיקה אם רול כבר קיים
        let mutedRole = guild.roles.cache.find(r => r.name === "Muted");
        if (mutedRole) {
            return message.reply("⚠️ רול **Muted** כבר קיים בשרת.");
        }

        try {
            // יצירת רול
            mutedRole = await guild.roles.create({
                name: "Muted",
                color: "#555555",
                permissions: []
            });

            // לולאה על כל הערוצים — הגדרת הרשאות
            guild.channels.cache.forEach(async channel => {
                try {
                    await channel.permissionOverwrites.edit(mutedRole, {
                        SendMessages: false,
                        AddReactions: false,
                        Speak: false,
                    });
                } catch (err) {
                    console.log(`שגיאה בערוץ ${channel.name}:`, err);
                }
            });

            message.reply("✅ הרול **Muted** נוצר בהצלחה! כל הערוצים עודכנו.");

        } catch (error) {
            console.error(error);
            message.reply("❌ אירעה שגיאה בעת יצירת הרול.");
        }
    }
};
