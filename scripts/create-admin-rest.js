const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createAdminWithRest() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const email = process.env.ADMIN_MAIL || process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = 'Admin Marketsource';
    const username = 'qtusadmin';
    const role = 'admin';

    if (!supabaseUrl || !serviceRoleKey || !email || !password) {
        console.error('❌ Missing Supabase URL, Service Role Key, ADMIN_MAIL, or ADMIN_PASSWORD');
        process.exit(1);
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        // Check if user exists using PostgREST
        const checkUrl = `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`;
        const checkRes = await fetch(checkUrl, {
            headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`
            }
        });

        const existingUsers = await checkRes.json();

        if (existingUsers && existingUsers.length > 0) {
            // Update existing user
            const userId = existingUsers[0].id;
            const updateUrl = `${supabaseUrl}/rest/v1/users?id=eq.${userId}`;
            const updateRes = await fetch(updateUrl, {
                method: 'PATCH',
                headers: {
                    'apikey': serviceRoleKey,
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    role: role,
                    password_hash: passwordHash,
                    name: name,
                    username: username,
                    updated_at: new Date().toISOString()
                })
            });

            if (updateRes.ok) {
                console.log(`✅ User ${email} updated to ADMIN via REST API.`);
            } else {
                const error = await updateRes.text();
                console.error('❌ Update failed:', error);
            }
        } else {
            // Create new admin
            const createUrl = `${supabaseUrl}/rest/v1/users`;
            const createRes = await fetch(createUrl, {
                method: 'POST',
                headers: {
                    'apikey': serviceRoleKey,
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    email: email,
                    name: name,
                    username: username,
                    password_hash: passwordHash,
                    role: role,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
            });

            if (createRes.ok) {
                // Never log plaintext password in console/logs.
                console.log(`✅ Admin account created via REST API: ${email}`);
            } else {
                const error = await createRes.text();
                console.error('❌ Creation failed:', error);
            }
        }
    } catch (error) {
        console.error('❌ Request failed:', error);
    }
}

createAdminWithRest();
