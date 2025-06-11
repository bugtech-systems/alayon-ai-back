import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ResourceTag } from '../models/resourceTag.model.js'; // Adjust the path as needed
import connectDB from '../services/db.js'; // Make sure this exports a connected mongoose instance

dotenv.config();
await connectDB();

// Clear old data
await ResourceTag.deleteMany();
console.log('🧹 Cleared existing ResourceTag data');

const config = await ResourceTag.create({
    resourceType: 'Organizations',
    name: 'config',
    fields: [
        { fieldName: 'name', dataType: 'string', description: 'Organization Name' },
        { fieldName: 'type', dataType: 'string', description: 'Label or Alias' },
        { fieldName: 'address', dataType: 'string', description: 'Organization Address' },
        { fieldName: 'description', dataType: 'string', description: 'Description of Org' },
        { fieldName: 'industry', dataType: 'string', description: 'Type of Industry' }
    ]
});

// 7. Create Users Config Resource
const userResourceConfig = await ResourceTag.create({
    resourceType: 'Users',
    name: 'config',
    fields: [
        { fieldName: 'firstName', dataType: 'string', description: 'First Name' },
        { fieldName: 'lastName', dataType: 'string', description: 'Last Name' },
        { fieldName: 'username', dataType: 'string', description: 'Username' },
        { fieldName: 'email', dataType: 'string', description: 'Email Address' },
        { fieldName: 'phoneNumber', dataType: 'string', description: 'Phone Number' },
        { fieldName: 'status', dataType: 'string', description: 'Account Status' },
        { fieldName: 'role', dataType: 'string', description: 'User Role' },
    ]
});


// 1. Create Role resourceType config (fields definition)
const roleConfig = await ResourceTag.create({
    resourceType: 'Role',
    name: 'config',
    fields: [
        { fieldName: 'name', dataType: 'string', description: 'Display name of the role' },
        { fieldName: 'value', dataType: 'string', description: 'System key or identifier for the role' },
        { fieldName: 'description', dataType: 'string', description: 'What this role is responsible for' }
    ]
});

// 2. Create sample roles
const roles = [
    {
        name: 'Super Admin',
        value: 'superadmin',
        description: 'Full system access and user management'
    },
    {
        name: 'Admin',
        value: 'admin',
        description: 'Manages resources and moderate-level permissions'
    },
    {
        name: 'Cashier',
        value: 'cashier',
        description: 'Handles transactions and payment records'
    },
    {
        name: 'Manager',
        value: 'manager',
        description: 'Oversees team operations and reporting'
    }
];

for (const role of roles) {
    await ResourceTag.create({
        resourceType: 'Role',
        name: role.name,
        values: [
            { fieldName: 'name', value: role.name },
            { fieldName: 'value', value: role.value },
            { fieldName: 'description', value: role.description }
        ]
    });
}

// 1. Create Status resourceType config (fields)
const statusConfig = await ResourceTag.create({
    resourceType: 'Status',
    name: 'config',
    fields: [
        { fieldName: 'name', dataType: 'string', description: 'Display label of the status' },
        { fieldName: 'value', dataType: 'string', description: 'System identifier for status' },
        { fieldName: 'description', dataType: 'string', description: 'Explanation of the status meaning' }
    ]
});

// 2. Define default statuses
const statuses = [
    {
        name: 'Active',
        value: 'active',
        description: 'User or entity is currently active and has access'
    },
    {
        name: 'Inactive',
        value: 'inactive',
        description: 'User or entity is not currently active or disabled'
    },
    {
        name: 'Invited',
        value: 'invited',
        description: 'User has been invited but not yet accepted or registered'
    },
    {
        name: 'Suspended',
        value: 'suspended',
        description: 'User or entity has been suspended due to policy violations or other reasons'
    }
];

// 3. Insert status records
for (const status of statuses) {
    await ResourceTag.create({
        resourceType: 'Status',
        name: status.name,
        values: [
            { fieldName: 'name', value: status.name },
            { fieldName: 'value', value: status.value },
            { fieldName: 'description', value: status.description }
        ]
    });
}



// 1. Create Organizations
const orgA = await ResourceTag.create({
    resourceType: 'Organizations',
    name: 'OpenAI',
    fields: [
        { fieldName: 'name', dataType: 'string', description: 'Organization Name' },
        { fieldName: 'type', dataType: 'string', description: 'Label or Alias' },
        { fieldName: 'address', dataType: 'string', description: 'Organization Address' },
        { fieldName: 'description', dataType: 'string', description: 'Description of Org' },
        { fieldName: 'industry', dataType: 'string', description: 'Type of Industry' }
    ],
    values: [
        { fieldName: 'name', value: 'OpenAI' },
        { fieldName: 'type', value: 'OpenAI HQ' },
        { fieldName: 'address', value: 'San Francisco, CA' },
        { fieldName: 'description', value: 'AI Research Company' },
        { fieldName: 'industry', value: 'AI Research' }
    ]
});

const orgB = await ResourceTag.create({
    resourceType: 'Organizations',
    name: 'TechBridge',
    fields: [
        { fieldName: 'name', dataType: 'string' },
        { fieldName: 'type', dataType: 'string' },
        { fieldName: 'address', dataType: 'string' },
        { fieldName: 'description', dataType: 'string' },
        { fieldName: 'industry', dataType: 'string' }
    ],
    values: [
        { fieldName: 'name', value: 'TechBridge' },
        { fieldName: 'type', value: 'TB Consulting' },
        { fieldName: 'address', value: 'New York, NY' },
        { fieldName: 'description', value: 'IT Solutions Company' },
        { fieldName: 'industry', value: 'Consulting' }
    ]
});

// 2. Create People
const person1 = await ResourceTag.create({
    resourceType: 'People',
    name: 'John Doe',
    values: [
        { fieldName: 'position', value: 'Engineer' }
    ],
    relationships: [
        { type: 'memberOf', refType: 'ResourceTag', refId: orgA._id }
    ]
});

const person2 = await ResourceTag.create({
    resourceType: 'People',
    name: 'Jane Smith',
    values: [
        { fieldName: 'position', value: 'Analyst' }
    ],
    relationships: [
        { type: 'memberOf', refType: 'ResourceTag', refId: orgB._id }
    ]
});

// 3. Create Group
const group1 = await ResourceTag.create({
    resourceType: 'Group',
    name: 'Research Team',
    values: [
        { fieldName: 'focus', value: 'LLM' }
    ],
    relationships: [
        { type: 'member', refType: 'ResourceTag', refId: person1._id }
    ]
});

// 4. Create Person Membership
const pm1 = await ResourceTag.create({
    resourceType: 'PersonMembership',
    name: 'John in OpenAI',
    relationships: [
        { type: 'person', refType: 'ResourceTag', refId: person1._id },
        { type: 'organization', refType: 'ResourceTag', refId: orgA._id }
    ]
});

const pm2 = await ResourceTag.create({
    resourceType: 'PersonMembership',
    name: 'Jane in TechBridge',
    relationships: [
        { type: 'person', refType: 'ResourceTag', refId: person2._id },
        { type: 'organization', refType: 'ResourceTag', refId: orgB._id }
    ]
});

// 5. Create Organization Membership
const om1 = await ResourceTag.create({
    resourceType: 'OrganizationMembership',
    name: 'OpenAI Research Team Membership',
    relationships: [
        { type: 'organization', refType: 'ResourceTag', refId: orgA._id },
        { type: 'group', refType: 'ResourceTag', refId: group1._id }
    ]
});

// 6. Create a Connection
const connection1 = await ResourceTag.create({
    resourceType: 'Connection',
    name: 'John ↔ Jane',
    relationships: [
        { type: 'from', refType: 'ResourceTag', refId: person1._id },
        { type: 'to', refType: 'ResourceTag', refId: person2._id }
    ]
});

console.log('✅ Default config seed data inserted successfully.');
process.exit(0);
