// קובץ בשם badwords.js לדוגמה
module.exports = {
  name: "messageCreate",
  execute(message) {
    // מתעלמים מהודעות של בוטים
    if (message.author.bot) return;

    // רשימת מילים אסורות
    const badWords = ["טיפש", "מגעיל", "מטומטם", "fuck", "shit"];

    // בודק אם ההודעה כוללת אחת מהמילים האסורות
    const foundWord = badWords.find(word => 
      message.content.toLowerCase().includes(word.toLowerCase())
    );

    if (foundWord) {
      // מוחק את ההודעה
      message.delete().catch(console.error);

      // שולח הודעה עם אזהרה
      message.channel.send(`${message.author}, אסור להשתמש במילים לא יפות! 🚫`);
    }
  }
};
                              
