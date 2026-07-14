const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, MessageFlags } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ]
});

// إعدادات الغرف الخاصة بك
const NOMINATION_CHANNEL_ID = '1483164935436374096'; 
const RESULT_CHANNEL_ID = '1519325101479297176';     

// الكلمات المفتاحية لرسائل التهنئة والإعلان الإدارية
const EXCLUDE_KEYWORDS = ['ها هو', 'مبروك', 'فاز', 'الفائز', 'تهنئة'];
const MAX_LETTER_LIMIT = 70; 

client.once('clientReady', async () => {
    console.log(`تم تشغيل البوت بنجاح باسم: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('sort')
            .setDescription('سحب كافة الترشيحات التاريخية بالكامل مع تمييز وقت التهنئة')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('تم تسجيل أمر السلاش بنجاح وجاهز للاستخدام!');
    } catch (error) {
        console.error('خطأ في تسجيل الأمر:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'sort') {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: 'عذراً، هذا الأمر مخصص للإدارة فقط.', flags: [MessageFlags.Ephemeral] });
        }

        const nominationChannel = client.channels.cache.get(NOMINATION_CHANNEL_ID);
        const resultChannel = client.channels.cache.get(RESULT_CHANNEL_ID);

        if (!nominationChannel || !resultChannel) {
            return interaction.reply({ content: 'خطأ: لم يتم العثور على الغرف المحددة.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.reply({ content: '🚀 جاري جلب الأرشيف وتمييز أوقات التهاني لحساب الأصوات بدقة متناهية...', flags: [MessageFlags.Ephemeral] });

        try {
            const nominationCounts = {};
            let allMessages = [];
            let lastMessageId = null;
            let fetchedMessages;

            // 1. جلب الأرشيف كاملاً مهما كان ضخماً
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                allMessages.push(...Array.from(fetchedMessages.values()));
                lastMessageId = fetchedMessages.last().id;

                await new Promise(resolve => setTimeout(resolve, 50));

            } while (fetchedMessages.size === 100);

            // ترتيب الرسائل من الأقدم للأحدث زمنياً
            allMessages.reverse();

            let lastCongratAuthorId = null;
            let lastCongratTime = 0;

            // 2. الفرز الذكي المعتمد على الوقت
            for (const msg of allMessages) {
                if (msg.author.bot) continue;

                const contentText = msg.content.toLowerCase().trim();
                const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(k => contentText.includes(k));
                const isCongratMessage = contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword;

                // أ) إذا كانت الرسالة عبارة عن تهنئة
                if (isCongratMessage) {
                    lastCongratAuthorId = msg.author.id;
                    lastCongratTime = msg.createdTimestamp; // حفظ وقت إرسال التهنئة بالملي ثانية
                    continue; // استبعاد رسالة التهنئة نفسها بالكامل من الحساب
                }

                // جلب المنشنات للأعضاء
                let userMentions = Array.from(msg.mentions.users.values()).filter(u => !u.bot);
                if (userMentions.length === 0) continue;

                // ب) تمييز الوقت: إذا كانت الرسالة تحتوي على منشن وجاءت مباشرة بعد التهنئة بفارق أقل من 60 ثانية (60000 ملي ثانية) ومن نفس الإداري
                const timeDifference = msg.createdTimestamp - lastCongratTime;

                if (lastCongratAuthorId && msg.author.id === lastCongratAuthorId && timeDifference < 60000) {
                    userMentions.shift(); // حذف أول منشن فقط (منشن الفائز المستبعد)
                    lastCongratAuthorId = null; // إعادة تعيين لعدم حذف أي منشنات أخرى لاحقاً
                }

                // ج) احتساب باقي المنشنات بشكل طبيعي جداً وسليم
                userMentions.forEach(user => {
                    nominationCounts[user.id] = (nominationCounts[user.id] || 0) + 1;
                });
            }

            // ترتيب النتيجة تنازلياً
            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return resultChannel.send('❌ انتهى سحب الروم ولم يتم العثور على أي منشنات صالحة.');
            }

            // 3. طباعة اللستة النهائية رسائل نصية عادية
            let currentMessageText = `📋 **اللستة النهائية والكاملة للترشيحات الموحدة (تم تصفية رسائل التهنئة ومنشن الفائز المباشر بدقة زمنية عالية):**\n\n`;

            for (let index = 0; index < sortedNominees.length; index++) {
                const [userId, count] = sortedNominees[index];
                const line = `**#${index + 1}** | <@${userId}> ➔ **${count}** صوت\n`;

                if ((currentMessageText + line).length > 1800) {
                    await resultChannel.send({ content: currentMessageText });
                    currentMessageText = line; 
                } else {
                    currentMessageText += line;
                }
            }

            if (currentMessageText.length > 0) {
                await resultChannel.send({ content: currentMessageText });
            }

        } catch (error) {
            console.error('حدث خطأ أثناء المعالجة الشاملة للروم:', error);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
