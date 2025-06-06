import { ResourceTag } from './models/ResourceTag.js'; // Adjust the path as needed
import connectDB from './services/db.js';

connectDB();

await ResourceTag.deleteMany(); // Clear old data

// 1. Create Organizations
const orgA = await ResourceTag.create({
    resourceType: 'Organization',
    name: 'OpenAI',
    fields: [{ fieldName: 'industry', dataType: 'string', description: 'Type of industry' }],
    values: [{ fieldName: 'industry', value: 'AI Research' }]
});

const orgB = await ResourceTag.create({
    resourceType: 'Organization',
    name: 'TechBridge',
    values: [{ fieldName: 'industry', value: 'Consulting' }]
});

// 2. Create People
const person1 = await ResourceTag.create({
    resourceType: 'People',
    name: 'John Doe',
    values: [{ fieldName: 'position', value: 'Engineer' }],
    relationships: [
        { type: 'memberOf', refType: 'ResourceTag', refId: orgA._id }
    ]
});

const person2 = await ResourceTag.create({
    resourceType: 'People',
    name: 'Jane Smith',
    values: [{ fieldName: 'position', value: 'Analyst' }],
    relationships: [
        { type: 'memberOf', refType: 'ResourceTag', refId: orgB._id }
    ]
});

// 3. Create Group
const group1 = await ResourceTag.create({
    resourceType: 'Group',
    name: 'Research Team',
    values: [{ fieldName: 'focus', value: 'LLM' }],
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

console.log('✅ Seed data inserted successfully.');
process.exit(0);