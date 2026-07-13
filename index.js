const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// إعدادات الغرف (استبدل الأرقام بـ IDs الخاصة بك)
const NOMINATION_CHANNEL_ID = '1483164935436374096'; 
const RESULT_CHANNEL_ID = '1519325101479297176'; 

// الكلمات المفتاحية لرسائل التهنئة والإعلان الإدارية
const EXCLUDE_KEYWORDS = ['ها هو', 'مبروك', 'فاز', 'الفائز', 'تهنئة'];
const MAX_LETTER_LIMIT = 70; 

// 1. تسجيل أمر السلاش لدى ديسكورد فور تشغيل البوت
client.once('ready', async () => {
    console.log(`تم تشغيل البوت بنجاح باسم: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('sort')
            .setDescription('فرز وسحب كافة الترشيحات وإرسالها للروم الثاني فوراً')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('جاري تسجيل أمر السلاش (/sort)...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('تم تسجيل أمر السلاش بنجاح وجاهز للاستخدام!');
    } catch (error) {
        console.error('خطأ في تسجيل الأمر:', error);
    }
});

// 2. استقبال وتشغيل أمر السلاش
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'sort') {
        // التحقق من الصلاحية
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: 'عذراً، هذا الأمر مخصص للإدارة فقط.', ephemeral: true });
        }

        const nominationChannel = client.channels.cache.get(NOMINATION_CHANNEL_ID);
        const resultChannel = client.channels.cache.get(RESULT_CHANNEL_ID);

        if (!nominationChannel || !resultChannel) {
            return interaction.reply({ content: 'خطأ: لم يتم العثور على الغرف المحددة في الكود.', ephemeral: true });
        }

        // الرد الفوري لإعلامك أن البوت بدأ العمل طائرًا (الرد مخفي لا يراه غيرك)
        await interaction.reply({ content: '🚀 جاري الفرز السريع والصامت والرفع للروم الثاني...', ephemeral: true });

        try {
            const nominationCounts = {};
            let lastMessageId = null;
            let totalFetched = 0;
            let fetchedMessages;
            let lastAdminWhoAnnounced = null;

            // سحب فائق السرعة متتالي
            do {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;

                fetchedMessages = await nominationChannel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                totalFetched += fetchedMessages.size;
                lastMessageId = fetchedMessages.last().id;

                // تحويل سريع للمصفوفة والفرز الذكي
                const messagesArray = Array.from(fetchedMessages.values()).reverse();

                for (const msg of messagesArray) {
                    if (msg.author.bot) continue;

                    const contentText = msg.content.toLowerCase();
                    const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(k => contentText.includes(k));

                    // إذا كانت تهنئة أو رسالة طويلة نسجل الإداري ونتخطاها
                    if (contentText.length > MAX_LETTER_LIMIT || hasExcludeKeyword) {
                        lastAdminWhoAnnounced = msg.author.id;
                        continue;
                    }

                    // تخطي منشن الفائز التابع للإداري
                    if (lastAdminWhoAnnounced && msg.author.id === lastAdminWhoAnnounced && msg.mentions.users.size > 0) {
                        lastAdminWhoAnnounced = null;
                        continue;
                    }

                    if (lastAdminWhoAnnounced && msg.author.id !== lastAdminWhoAnnounced) {
                        lastAdminWhoAnnounced = null;
                    }

                    // إضافة الأصوات
                    msg.mentions.users.forEach(user => {
                        if (!user.bot) {
                            nominationCounts[user.id] = (nominationCounts[user.id] || 0) + 1;
                        }
                    });
                }

            } while (fetchedMessages.size === 100);

            // ترتيب تنازلي
            const sortedNominees = Object.entries(nominationCounts)
                .sort((a, b) => b[1] - a[1]);

            if (sortedNominees.length === 0) {
                return resultChannel.send('❌ انتهى الفرز ولم يتم العثور على ترشيحات صالحة.');
            }

            // بناء اللستة الموحدة
            const embed = new EmbedBuilder()
                .setTitle('📊 اللستة النهائية لفرز الترشيحات')
                .setDescription(`تم فحص **${totalFetched}** رسالة بنجاح ونزع منشنات التهنئة الإدارية تلقائياً.`)
                .setColor('#2efc03')
                .setTimestamp();

            let descriptionText = '';
            sortedNominees.forEach(([userId, count], index) => {
                descriptionText += `**#${index + 1}** | <@${userId}> ➔ **${count}** صوت\n`;
            });

            if (descriptionText.length > 4000) {
                descriptionText = descriptionText.substring(0, 3950) + '\n... وتستمر القائمة الباقية';
            }

            embed.addFields({ name: 'الترتيب التنازلي من الأكثر للأقل تصويتاً:', value: descriptionText });

            // إرسال النتيجة في الروم الثاني فوراً
            await resultChannel.send({ embeds: [embed] });

        } catch (error) {
            console.error('حدث خطأ أثناء الفرز السريع:', error);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
