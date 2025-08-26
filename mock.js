import express from 'express';
import cors from 'cors';

const app = express();
const port = 3301;

app.use(cors());
app.use(express.json());

// Mock data
const usersData = [
    { id: 1, name: 'John Doe', email: 'john@example.com', role: 'Admin', status: 'Active', createdAt: '2023-01-15' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'User', status: 'Active', createdAt: '2023-02-20' },
    { id: 3, name: 'Bob Johnson', email: 'bob@example.com', role: 'User', status: 'Inactive', createdAt: '2023-03-10' },
    { id: 4, name: 'Alice Brown', email: 'alice@example.com', role: 'Moderator', status: 'Active', createdAt: '2023-04-05' },
    { id: 5, name: 'Charlie Wilson', email: 'charlie@example.com', role: 'User', status: 'Pending', createdAt: '2023-05-12' }
];

const productsData = [
    { id: 1, name: 'Laptop Pros', price: 1299.99, category: 'Electronics', stock: 45, rating: 4.5, featured: true },
    { id: 2, name: 'Wireless Headphones', price: 149.99, category: 'Electronics', stock: 12, rating: 4.2, featured: false },
    { id: 3, name: 'Desk Lamp', price: 29.99, category: 'Home', stock: 100, rating: 3.8, featured: true },
    { id: 4, name: 'Coffee Maker', price: 89.99, category: 'Kitchen', stock: 8, rating: 4.7, featured: false },
    { id: 5, name: 'Smart Watch', price: 249.99, category: 'Electronics', stock: 25, rating: 4.8, featured: true }
];

const ordersData = [
    { id: 1, customerName: 'John Doe', total: 299.97, status: 'Completed', date: '2023-06-01', items: 3 },
    { id: 2, customerName: 'Jane Smith', total: 149.99, status: 'Processing', date: '2023-06-02', items: 1 },
    { id: 3, customerName: 'Bob Johnson', total: 529.97, status: 'Shipped', date: '2023-06-03', items: 2 },
    { id: 4, customerName: 'Alice Brown', total: 89.99, status: 'Completed', date: '2023-06-04', items: 1 },
    { id: 5, customerName: 'Charlie Wilson', total: 379.98, status: 'Pending', date: '2023-06-05', items: 2 }
];

// Helper function to apply filters
const applyFilters = (data, query) => {
    let filteredData = [...data];

    Object.entries(query).forEach(([key, value]) => {
        if (key.startsWith('filter[') && value) {
            const field = key.match(/\[(.*?)\]/)[1];
            filteredData = filteredData.filter(item =>
                String(item[field]).toLowerCase().includes(String(value).toLowerCase())
            );
        }
    });

    return filteredData;
};

// Helper function to apply sorting
const applySorting = (data, sortField, sortDirection) => {
    if (!sortField) return data;

    return [...data].sort((a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
};

// Helper function to paginate results
const paginateData = (data, page = 1, pageSize = 10) => {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const total = data.length;
    const totalPages = Math.ceil(total / pageSize);

    return {
        data: data.slice(startIndex, endIndex),
        pagination: {
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    };
};

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Config endpoints
app.get('/api/config/:resource', (req, res) => {
    const { resource } = req.params;

    const configs = {
        users: {
            id: 'users',
            name: 'User Management',
            description: 'Manage system users and their permissions',
            fields: [
                {
                    field_name: 'id',
                    data_type: 'number',
                    default_value: null,
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'name',
                    data_type: 'string',
                    default_value: '',
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'email',
                    data_type: 'string',
                    default_value: '',
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'role',
                    data_type: 'string',
                    default_value: 'User',
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'status',
                    data_type: 'string',
                    default_value: 'Active',
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'createdAt',
                    data_type: 'date',
                    default_value: new Date().toISOString(),
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                }
            ],
            views: {
                dashboard: {
                    widgets: [
                        {
                            type: 'stats',
                            title: 'Total Users',
                            config: { value: usersData.length, description: '+2 from last month' },
                            position: { row: 1, col: 1, width: 1, height: 1 }
                        },
                        {
                            type: 'stats',
                            title: 'Active Users',
                            config: { value: usersData.filter(u => u.status === 'Active').length, description: 'Currently active' },
                            position: { row: 1, col: 2, width: 1, height: 1 }
                        },
                        {
                            type: 'chart',
                            title: 'Users by Role',
                            config: { chartType: 'bar' },
                            position: { row: 1, col: 3, width: 1, height: 2 }
                        },
                        {
                            type: 'chart',
                            title: 'User Status Distribution',
                            config: { chartType: 'pie' },
                            position: { row: 2, col: 1, width: 2, height: 1 }
                        }
                    ],
                    layout: { gridCols: 3, gridRows: 2 }
                },
                table: {
                    columns: [
                        { field: 'id', header: 'ID', sortable: true, filterable: true, width: 80 },
                        { field: 'name', header: 'Name', sortable: true, filterable: true, width: 150 },
                        { field: 'email', header: 'Email', sortable: true, filterable: true, width: 200 },
                        { field: 'role', header: 'Role', sortable: true, filterable: true, width: 120 },
                        { field: 'status', header: 'Status', sortable: true, filterable: true, width: 100 },
                        { field: 'createdAt', header: 'Created At', sortable: true, filterable: true, width: 120 }
                    ],
                    pageSize: 10,
                    enablePagination: true,
                    enableSorting: true
                },
                cards: {
                    displayFields: ['name', 'email', 'role', 'status', 'createdAt'],
                    cardSize: 'md'
                }
            }
        },
        products: {
            id: 'products',
            name: 'Product Catalog',
            description: 'Manage products and inventory',
            fields: [
                {
                    field_name: 'id',
                    data_type: 'number',
                    default_value: null,
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'name',
                    data_type: 'string',
                    default_value: '',
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'pricess',
                    data_type: 'number',
                    default_value: 0,
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'category',
                    data_type: 'string',
                    default_value: '',
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'stock',
                    data_type: 'number',
                    default_value: 0,
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'rating',
                    data_type: 'number',
                    default_value: 0,
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'featured',
                    data_type: 'boolean',
                    default_value: false,
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                }
            ],
            views: {
                dashboard: {
                    widgets: [
                        {
                            type: 'stats',
                            title: 'Total Products',
                            config: { value: productsData.length, description: 'In stock' },
                            position: { row: 1, col: 1, width: 1, height: 1 }
                        },
                        {
                            type: 'stats',
                            title: 'Low Stock',
                            config: { value: productsData.filter(p => p.stock < 10).length, description: 'Needs restocking' },
                            position: { row: 1, col: 2, width: 1, height: 1 }
                        },
                        {
                            type: 'stats',
                            title: 'Featured Products',
                            config: { value: productsData.filter(p => p.featured).length, description: 'Special items' },
                            position: { row: 1, col: 3, width: 1, height: 1 }
                        },
                        {
                            type: 'chart',
                            title: 'Products by Category',
                            config: { chartType: 'bar' },
                            position: { row: 2, col: 1, width: 3, height: 2 }
                        }
                    ],
                    layout: { gridCols: 3, gridRows: 2 }
                },
                table: {
                    columns: [
                        { field: 'id', header: 'ID', sortable: true, filterable: true, width: 80 },
                        { field: 'name', header: 'Name', sortable: true, filterable: true, width: 150 },
                        { field: 'price', header: 'Pricess', sortable: true, filterable: true, width: 100 },
                        { field: 'category', header: 'Category', sortable: true, filterable: true, width: 120 },
                        { field: 'stock', header: 'Stock', sortable: true, filterable: true, width: 80 },
                        { field: 'rating', header: 'Rating', sortable: true, filterable: true, width: 80 },
                        { field: 'featured', header: 'Featured', sortable: true, filterable: true, width: 80 }
                    ],
                    pageSize: 10,
                    enablePagination: true,
                    enableSorting: true
                },
                cards: {
                    displayFields: ['name', 'price', 'category', 'stock', 'rating', 'featured'],
                    cardSize: 'sm'
                }
            }
        },
        orders: {
            id: 'orders',
            name: 'Order Management',
            description: 'View and manage customer orders',
            fields: [
                {
                    field_name: 'id',
                    data_type: 'number',
                    default_value: null,
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'customerName',
                    data_type: 'string',
                    default_value: '',
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'total',
                    data_type: 'number',
                    default_value: 0,
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'status',
                    data_type: 'string',
                    default_value: 'Pending',
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'date',
                    data_type: 'date',
                    default_value: new Date().toISOString(),
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                },
                {
                    field_name: 'items',
                    data_type: 'number',
                    default_value: 0,
                    column_view: true,
                    has_filter: true,
                    display_view: true,
                    sortable: true
                }
            ],
            views: {
                dashboard: {
                    widgets: [
                        {
                            type: 'stats',
                            title: 'Total Orders',
                            config: { value: ordersData.length, description: 'This month' },
                            position: { row: 1, col: 1, width: 1, height: 1 }
                        },
                        {
                            type: 'stats',
                            title: 'Total Revenue',
                            config: { value: ordersData.reduce((sum, order) => sum + order.total, 0), description: 'All time' },
                            position: { row: 1, col: 2, width: 1, height: 1 }
                        },
                        {
                            type: 'chart',
                            title: 'Orders by Status',
                            config: { chartType: 'pie' },
                            position: { row: 1, col: 3, width: 1, height: 2 }
                        },
                        {
                            type: 'chart',
                            title: 'Revenue Trend',
                            config: { chartType: 'line' },
                            position: { row: 2, col: 1, width: 2, height: 1 }
                        }
                    ],
                    layout: { gridCols: 3, gridRows: 2 }
                },
                table: {
                    columns: [
                        { field: 'id', header: 'Order ID', sortable: true, filterable: true, width: 80 },
                        { field: 'customerName', header: 'Customer', sortable: true, filterable: true, width: 150 },
                        { field: 'total', header: 'Total', sortable: true, filterable: true, width: 100 },
                        { field: 'status', header: 'Status', sortable: true, filterable: true, width: 100 },
                        { field: 'date', header: 'Date', sortable: true, filterable: true, width: 120 },
                        { field: 'items', header: 'Items', sortable: true, filterable: true, width: 80 }
                    ],
                    pageSize: 10,
                    enablePagination: true,
                    enableSorting: true
                },
                cards: {
                    displayFields: ['customerName', 'total', 'status', 'date', 'items'],
                    cardSize: 'lg'
                }
            }
        }
    };

    const config = configs[resource];

    if (config) {
        res.json(config);
    } else {
        res.status(404).json({ error: 'Resource not found', availableResources: Object.keys(configs) });
    }
});

// Data endpoints with pagination support
app.get('/api/data/:resource', (req, res) => {
    const { resource } = req.params;
    const { page = 1, pageSize = 10, sort, order = 'asc' } = req.query;

    const dataSources = {
        users: usersData,
        products: productsData,
        orders: ordersData
    };

    const data = dataSources[resource];

    if (!data) {
        return res.status(404).json({
            error: 'Resource not found',
            availableResources: Object.keys(dataSources)
        });
    }

    try {
        // Apply filters
        let filteredData = applyFilters(data, req.query);

        // Apply sorting
        const sortedData = applySorting(filteredData, sort, order);

        // Apply pagination
        const paginatedData = paginateData(sortedData, parseInt(page), parseInt(pageSize));

        res.json({
            data: paginatedData.data,
            pagination: paginatedData.pagination,
            filters: req.query,
            sort: { field: sort, direction: order }
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to process data',
            message: error.message
        });
    }
});

// Get single item endpoint
app.get('/api/data/:resource/:id', (req, res) => {
    const { resource, id } = req.params;

    const dataSources = {
        users: usersData,
        products: productsData,
        orders: ordersData
    };

    const data = dataSources[resource];

    if (!data) {
        return res.status(404).json({ error: 'Resource not found' });
    }

    const item = data.find(item => item.id === parseInt(id));

    if (!item) {
        return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
});

// Create new item endpoint
app.post('/api/data/:resource', (req, res) => {
    const { resource } = req.params;
    const newItem = req.body;

    const dataSources = {
        users: usersData,
        products: productsData,
        orders: ordersData
    };

    const data = dataSources[resource];

    if (!data) {
        return res.status(404).json({ error: 'Resource not found' });
    }

    // Generate new ID
    const newId = Math.max(...data.map(item => item.id)) + 1;
    const itemWithId = { ...newItem, id: newId };

    // In a real application, you would save to a database
    data.push(itemWithId);

    res.status(201).json(itemWithId);
});

// Update item endpoint
app.put('/api/data/:resource/:id', (req, res) => {
    const { resource, id } = req.params;
    const updatedItem = req.body;

    const dataSources = {
        users: usersData,
        products: productsData,
        orders: ordersData
    };

    const data = dataSources[resource];

    if (!data) {
        return res.status(404).json({ error: 'Resource not found' });
    }

    const index = data.findIndex(item => item.id === parseInt(id));

    if (index === -1) {
        return res.status(404).json({ error: 'Item not found' });
    }

    // Preserve the ID
    updatedItem.id = parseInt(id);
    data[index] = updatedItem;

    res.json(updatedItem);
});

// Delete item endpoint
app.delete('/api/data/:resource/:id', (req, res) => {
    const { resource, id } = req.params;

    const dataSources = {
        users: usersData,
        products: productsData,
        orders: ordersData
    };

    const data = dataSources[resource];

    if (!data) {
        return res.status(404).json({ error: 'Resource not found' });
    }

    const index = data.findIndex(item => item.id === parseInt(id));

    if (index === -1) {
        return res.status(404).json({ error: 'Item not found' });
    }

    const deletedItem = data.splice(index, 1)[0];

    res.json({ message: 'Item deleted successfully', item: deletedItem });
});

// Get available resources endpoint
app.get('/api/resources', (req, res) => {
    res.json([
        { id: 'users', name: 'Users', description: 'Manage system users' },
        { id: 'products', name: 'Products', description: 'Manage product catalog' },
        { id: 'orders', name: 'Orders', description: 'View and manage orders' }
    ]);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// // 404 handler
// app.use('*', (req, res) => {
//     res.status(404).json({ error: 'Endpoint not found' });
// });

// Start server
app.listen(port, () => {
    console.log(`🚀 Mock API server running at http://localhost:${port}`);
    console.log(`📊 Available resources: /api/resources`);
    console.log(`🔧 Health check: /api/health`);
    console.log(`📋 Example config: /api/config/users`);
    console.log(`📊 Example data: /api/data/users`);
});