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
    console.log(`🚀 تم تشغيل البوت بنجاح وجاهز للفرز الفائق: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('sort')
            .setDescription('سحب كافة الترشيحات التاريخية بدقة 100% وبدون ضياع أي صوت')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('تم تسجيل أمر السلاش بنجاح!');
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

        await interaction.reply({ content: '⚡ جاري مسح وقراءة كامل الروم حرفاً بحرف لضمان عدم ضياع أي صوت نهائياً...', flags: [MessageFlags.Ephemeral] });

        try {
            const nominationCounts = {};
            let allMessages = [];
            let lastMessageId = null;
            let fetchedMessages;

            // 1. جلب الأرشيف بالكامل من ديسكورد
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                allMessages.push(...Array.from(fetchedMessages.values()));
                lastMessageId = fetchedMessages.last().id;

                await new Promise(resolve => setTimeout(resolve, 30)); // تأخير خفيف آمن للسرعة

            } while (fetchedMessages.size === 100);

            // ترتيب الرسائل من الأقدم للأحدث زمنياً لمعالجة التواريخ بدقة
            allMessages.reverse();

            let lastCongratAuthorId = null;
            let lastCongratTime = 0;

            // 2. الفرز والتحليل الدقيق للغاية
            for (const msg of allMessages) {
                if (msg.author.bot) continue; // استبعاد البوتات

                const contentText = msg.content.toLowerCase().trim();
                const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(k => contentText.includes(k));
                const isCongratMessage = contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword;

                // أ) رصد رسالة التهنئة
                if (isCongratMessage) {
                    lastCongratAuthorId = msg.author.id;
                    lastCongratTime = msg.createdTimestamp;
                    continue; // تخطي رسالة التهنئة نفسها
                }

                // ب) استخراج جميع الـ IDs للمنشنات المتوفرة في نص الرسالة (الخام) لمنع سقوط أي منشن بسبب الكاش
                const mentionMatches = [...msg.content.matchAll(/<@!?(\d+)>/g)];
                if (mentionMatches.length === 0) continue;

                // تحويل الماتشات لـ IDs حقيقية فريدة لكل شخص داخل الرسالة الواحدة
                let userIdsInMessage = [...new Set(mentionMatches.map(match => match[1]))];

                // ج) منطق تمييز التهنئة والوقت:
                // إذا أرسل الإداري منشن واحد فقط بعد التهنئة مباشرة (أقل من دقيقة) -> نهمله (لأنه منشن الفائز)
                const timeDifference = msg.createdTimestamp - lastCongratTime;
                if (lastCongratAuthorId && msg.author.id === lastCongratAuthorId && timeDifference < 60000) {
                    if (userIdsInMessage.length === 1) {
                        // إذا كان منشن واحد فقط، نقوم بإهماله بالكامل
                        lastCongratAuthorId = null; 
                        continue; 
                    } else if (userIdsInMessage.length > 1) {
                        // إذا كان أكثر من منشن، نحذف المنشن الأول فقط (الفائز) ونحتفظ بالبقية!
                        userIdsInMessage.shift();
                        lastCongratAuthorId = null;
                    }
                }

                // د) تسجيل الأصوات للأعضاء المرشحين
                userIdsInMessage.forEach(userId => {
                    nominationCounts[userId] = (nominationCounts[userId] || 0) + 1;
                });
            }

            // ترتيب تنازلي للأصوات
            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return resultChannel.send('❌ انتهى الفحص ولم يتم العثور على أي ترشيحات صالحة.');
            }

            // 3. طباعة اللستة النهائية رسائل نصية عادية منسقة وبدقة كاملة
            let currentMessageText = `📋 **اللستة النهائية الشاملة والدقيقة للترشيحات الموحدة (تم فحص ${allMessages.length} رسالة بالتاريخ بدقة 100%):**\n\n`;

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
