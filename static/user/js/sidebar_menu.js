document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const toggleBtn = document.getElementById('menuToggle');
    const closeBtn = document.getElementById('sidebarCloseBtn');

    if (!sidebar || !backdrop || !toggleBtn) return;

    function openSidebar() {
        sidebar.classList.add('open');
        backdrop.classList.add('active');
        document.body.classList.add('sidebar-open');
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        backdrop.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }

    toggleBtn.addEventListener('click', function () {
        if (sidebar.classList.contains('open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', closeSidebar);
    }

    backdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && sidebar.classList.contains('open')) {
            closeSidebar();
        }
    });

    document.querySelectorAll('.sidebar .nav-item').forEach(function (item) {
        item.addEventListener('click', function () {
            if (window.innerWidth <= 1024) {
                closeSidebar();
            }
        });
    });
});
