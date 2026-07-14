const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, MessageFlags } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // تأكد من تفعيل هذا الخيار في الـ Developer Portal للبوت
    ]
});

// إعدادات الغرف الخاصة بك ثابتة ومباشرة
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
            .setDescription('سحب كافة الترشيحات التاريخية بالكامل وبأعلى دقة دون ليميت')
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

        // رد مخفي فوري للإداري
        await interaction.reply({ content: '🚀 بدأ السحب الكامل والعميق للروم (حتى لو تجاوز 10 آلاف رسالة)، انتظر ثوانٍ وستجد النتيجة طارت بالروم الآخر...', flags: [MessageFlags.Ephemeral] });

        try {
            const nominationCounts = {};
            let allMessages = [];
            let lastMessageId = null;
            let fetchedMessages;

            // حماية ضد الـ Rate Limit وتجنب الوقوع في فخ الحد الأقصى للجلب
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                allMessages.push(...Array.from(fetchedMessages.values()));
                lastMessageId = fetchedMessages.last().id;

                // تأخير بسيط جداً (50 ملي ثانية) لتجنب حظر ديسكورد المؤقت أثناء سحب آلاف الرسائل متتالية
                await new Promise(resolve => setTimeout(resolve, 50));

            } while (fetchedMessages.size === 100);

            // ترتيب الرسائل من الأقدم للأحدث تصاعدياً ليمشي الفرز زمنياً وبدقة
            allMessages.reverse();

            let lastAdminWhoAnnounced = null;

            for (const msg of allMessages) {
                if (msg.author.bot) continue;

                const contentText = msg.content.toLowerCase().trim();
                const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(k => contentText.includes(k));

                // 1. استبعاد رسائل التهنئة كلياً
                if (contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword) {
                    lastAdminWhoAnnounced = msg.author.id;
                    continue; 
                }

                // 2. استخدام المنشنات الرسمية والمسجلة بالرسالة من ديسكورد لضمان دقة 100%
                let userMentions = Array.from(msg.mentions.users.values()).filter(u => !u.bot);

                if (userMentions.length === 0) continue; // تخطي الرسائل التي لا تحتوي على منشنات صالحة

                // 3. استبعاد أول منشن (الفائز) فقط إذا جاءت الرسالة مباشرة بعد تهنئة نفس الإداري
                if (lastAdminWhoAnnounced && msg.author.id === lastAdminWhoAnnounced) {
                    userMentions.shift(); // حذف أول منشن بالرسالة
                    lastAdminWhoAnnounced = null; // تصفير حالة الترقب للإداري فوراً
                }

                // 4. احتساب الأصوات بدقة لكل منشن متبقي بالرسالة
                userMentions.forEach(user => {
                    nominationCounts[user.id] = (nominationCounts[user.id] || 0) + 1;
                });
            }

            // ترتيب تنازلي للأصوات
            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return resultChannel.send('❌ انتهى سحب الروم بالكامل ولم يتم العثور على أي ترشيحات صالحة بعد التصفية.');
            }

            // 5. بناء الرسائل وإرسالها كنصوص طبيعية دون ليميت
            let currentMessageText = `📋 **اللستة النهائية والكاملة للترشيحات الموحدة (تم سحب وفحص ${allMessages.length} رسالة بالتاريخ بدقة متناهية 100%):**\n\n`;

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
