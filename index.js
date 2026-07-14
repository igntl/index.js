const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, MessageFlags } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
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
            .setDescription('سحب كافة الترشيحات التاريخية بدقة متناهية ونقلها لشات النتائج')
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

        await interaction.reply({ content: '🚀 جاري بدء الفرز الشامل والدقيق جداً لجميع الأصوات بالتاريخ...', flags: [MessageFlags.Ephemeral] });

        try {
            const nominationCounts = {};
            let allMessages = [];
            let lastMessageId = null;
            let fetchedMessages;

            // 1. جلب كامل أرشيف الروم أولاً وتخزينه في مصفوفة واحدة
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                allMessages.push(...Array.from(fetchedMessages.values()));
                lastMessageId = fetchedMessages.last().id;

            } while (fetchedMessages.size === 100);

            // 2. ترتيب كافة الرسائل ترتيباً زمنياً تصاعدياً (من الأقدم للأحدث مطلقاً)
            allMessages.reverse();

            let lastAdminWhoAnnounced = null;

            // 3. المعالجة والفرز الدقيق خطوة بخطوة
            for (const msg of allMessages) {
                if (msg.author.bot) continue;

                const contentText = msg.content.toLowerCase().trim();
                const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(k => contentText.includes(k));

                // هل الرسالة إعلان تهنئة؟
                if (contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword) {
                    lastAdminWhoAnnounced = msg.author.id; // تسجيل الإداري المنتظر منشن الفائز منه
                    continue; // تخطي رسالة التهنئة
                }

                // استخراج كافة الـ IDs للمنشنات داخل الرسالة باستخدام الـ RegExp لضمان عدم سقوط أي منشن
                const mentionMatches = [...contentText.matchAll(/<@!?(\d+)>/g)];
                if (mentionMatches.length === 0) continue;

                // تحويل الماتشات إلى مصفوفة نظيفة من الـ IDs
                let userIds = mentionMatches.map(match => match[1]);

                // استبعاد منشن الفائز الأول فقط إذا جاءت الرسالة مباشرة بعد تهنئة نفس الإداري
                if (lastAdminWhoAnnounced && msg.author.id === lastAdminWhoAnnounced) {
                    userIds.shift(); // حذف أول منشن بالرسالة (الفائز)
                    lastAdminWhoAnnounced = null; // تصفير الترقب فوراً
                }

                // احتساب الأصوات لجميع الأعضاء المتبقين في الرسالة
                userIds.forEach(id => {
                    nominationCounts[id] = (nominationCounts[id] || 0) + 1;
                });
            }

            // ترتيب النتيجة تنازلياً للأصوات
            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return resultChannel.send('❌ انتهى سحب الروم ولم يتم العثور على ترشيحات صالحة بعد الفرز الفائق.');
            }

            // 4. إرسال النتائج كرسائل نصية طبيعية منسقة
            let currentMessageText = `📋 **اللستة النهائية والكاملة للترشيحات الموحدة (تم فحص ${allMessages.length} رسالة بالتاريخ بدقة متناهية):**\n\n`;

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
