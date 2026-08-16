/**
 * INDONESIAN ACTIVE FAULTS & MEGATHRUST SUBDUCTION DATASET
 * Sumber: Pusat Studi Gempa Nasional (PusGen 2017/ESDM) & USGS Plate Boundaries (PB2002)
 * Digunakan untuk visualisasi geologis interaktif di Leaflet Seismograph.
 */

const FAULT_LINES_DATA = [
    // ==================== 1. SISTEM SESAR BESAR SUMATERA (GREAT SUMATRAN FAULT / SESAR SEMANGKO) ====================
    {
        name: "Sesar Semangko - Segmen Seulimeum",
        region: "Aceh",
        type: "Dextral Strike-Slip (Sesar Geser)",
        desc: "Segmen sesar aktif di bagian utara Aceh melintasi lembah Seulimeum dan Banda Aceh.",
        coords: [[5.65, 95.35], [5.50, 95.50], [5.30, 95.70], [5.05, 95.90]]
    },
    {
        name: "Sesar Semangko - Segmen Tripa",
        region: "Aceh & Sumatera Utara",
        type: "Dextral Strike-Slip (Sesar Geser)",
        desc: "Segmen sesar aktif di selatan Gunung Leuser menuju batas Sumatera Utara.",
        coords: [[4.40, 96.30], [4.10, 96.65], [3.75, 97.00], [3.40, 97.35]]
    },
    {
        name: "Sesar Semangko - Segmen Renun & Toru",
        region: "Sumatera Utara (Danau Toba - Tapanuli)",
        type: "Dextral Strike-Slip (Sesar Geser)",
        desc: "Melintasi lembah barat Danau Toba, Dairi, Humbang Hasundutan, hingga Tapanuli Utara / Sibolga.",
        coords: [[2.95, 97.80], [2.50, 98.25], [2.05, 98.70], [1.70, 99.00], [1.40, 99.30]]
    },
    {
        name: "Sesar Semangko - Segmen Angkola & Barumun",
        region: "Sumatera Utara & Riau Barat",
        type: "Dextral Strike-Slip (Sesar Geser)",
        desc: "Melintasi lembah Batang Angkola, Padangsidimpuan, Tapanuli Selatan hingga perbatasan Sumatera Barat.",
        coords: [[1.40, 99.30], [1.05, 99.65], [0.70, 100.00], [0.35, 100.25]]
    },
    {
        name: "Sesar Semangko - Segmen Sianok & Sumani",
        region: "Sumatera Barat (Bukittinggi - Padang Panjang)",
        type: "Dextral Strike-Slip (Sesar Geser)",
        desc: "Membelah Ngarai Sianok, Danau Singkarak, hingga Kota Solok dengan aktivitas seismik tinggi.",
        coords: [[0.20, 100.30], [-0.10, 100.35], [-0.35, 100.42], [-0.65, 100.55], [-0.95, 100.75]]
    },
    {
        name: "Sesar Semangko - Segmen Suliti & Siulak",
        region: "Sumatera Barat & Jambi (Kerinci)",
        type: "Dextral Strike-Slip (Sesar Geser)",
        desc: "Melintasi lembah Gunung Kerinci, Danau Kerinci, hingga Sangir di Solok Selatan.",
        coords: [[-0.95, 100.75], [-1.35, 101.00], [-1.75, 101.25], [-2.15, 101.55], [-2.55, 101.85]]
    },
    {
        name: "Sesar Semangko - Segmen Dikit, Ketaun & Musi",
        region: "Bengkulu & Sumatera Selatan",
        type: "Dextral Strike-Slip (Sesar Geser)",
        desc: "Melintasi perbukitan Bukit Barisan di Rejang Lebong, Curup, hingga Kepahiang.",
        coords: [[-2.55, 101.85], [-3.05, 102.20], [-3.55, 102.55], [-4.05, 102.90], [-4.55, 103.25]]
    },
    {
        name: "Sesar Semangko - Segmen Manna & Kumering",
        region: "Bengkulu, Sumsel & Lampung",
        type: "Dextral Strike-Slip (Sesar Geser)",
        desc: "Membentang di Danau Ranau, Liwa, hingga Kotabumi di Lampung Barat.",
        coords: [[-4.55, 103.25], [-4.95, 103.60], [-5.35, 103.95], [-5.75, 104.30]]
    },
    {
        name: "Sesar Semangko - Segmen Teluk Semangko",
        region: "Lampung (Selat Sunda)",
        type: "Dextral Strike-Slip & Normal",
        desc: "Ujung selatan Sesar Sumatera yang bermuara di perairan Teluk Semangko dan Selat Sunda.",
        coords: [[-5.75, 104.30], [-6.00, 104.55], [-6.25, 104.80], [-6.45, 105.00]]
    },

    // ==================== 2. SESAR AKTIF PULAU JAWA ====================
    {
        name: "Sesar Cimandiri",
        region: "Jawa Barat (Pelabuhan Ratu - Cianjur)",
        type: "Sinistral Strike-Slip & Oblique",
        desc: "Sesar aktif membentang dari Teluk Pelabuhan Ratu melintasi Sukabumi, Cianjur, hingga Padalarang.",
        coords: [[-7.05, 106.45], [-6.98, 106.70], [-6.92, 106.95], [-6.86, 107.20], [-6.80, 107.45]]
    },
    {
        name: "Sesar Lembang",
        region: "Jawa Barat (Bandung Utara)",
        type: "Sinistral Strike-Slip (Sesar Geser)",
        desc: "Gawir sesar aktif sepanjang 29 km di utara Cekungan Bandung dari Padalarang hingga Gunung Tangkuban Parahu.",
        coords: [[-6.80, 107.48], [-6.81, 107.58], [-6.82, 107.68], [-6.83, 107.78]]
    },
    {
        name: "Sesar Baribis - Kendeng",
        region: "Jawa Barat & Banten (Majalengka - Subang - Bekasi - Tangerang)",
        type: "Thrust Fault (Sesar Naik)",
        desc: "Jalur sesar naik aktif yang memanjang di selatan Jakarta, melintasi Bekasi, Purwakarta, Subang, hingga Cirebon.",
        coords: [[-6.30, 106.70], [-6.40, 107.05], [-6.55, 107.45], [-6.70, 107.85], [-6.85, 108.20], [-7.00, 108.50]]
    },
    {
        name: "Sesar Opak",
        region: "D.I. Yogyakarta (Bantul - Prambanan)",
        type: "Sinistral Strike-Slip & Normal",
        desc: "Sesar aktif yang membentang di sepanjang Sungai Opak dari Pantai Parangtritis hingga lereng Merapi.",
        coords: [[-8.08, 110.32], [-7.92, 110.40], [-7.78, 110.48], [-7.62, 110.55]]
    },
    {
        name: "Sesar Kendeng & Pasuruan",
        region: "Jawa Tengah & Jawa Timur",
        type: "Thrust Fault (Sesar Naik)",
        desc: "Zona sesar naik yang melintang di pedalaman Jawa Timur dari Bojonegoro, Mojokerto, hingga Pasuruan.",
        coords: [[-7.15, 110.80], [-7.22, 111.45], [-7.28, 112.10], [-7.35, 112.75], [-7.55, 113.30]]
    },

    // ==================== 3. BALI & NUSA TENGGARA ====================
    {
        name: "Flores Back-Arc Thrust (Sesar Naik Busur Belakang Flores)",
        region: "Bali, Lombok, Sumbawa & Flores",
        type: "Thrust Fault (Sesar Naik Belakang Busur)",
        desc: "Sesar naik raksasa di laut utara Bali, Lombok, Sumbawa, dan Flores penyebab gempa Lombok 2018.",
        coords: [[-7.75, 115.20], [-7.85, 116.50], [-7.95, 118.00], [-8.05, 119.80], [-8.15, 121.50], [-8.25, 123.50]]
    },

    // ==================== 4. SULAWESI & INDONESIA TENGAH ====================
    {
        name: "Sesar Palu-Koro",
        region: "Sulawesi Tengah (Palu - Kulawi)",
        type: "Sinistral Strike-Slip (Sesar Geser Cepat)",
        desc: "Salah satu sesar paling aktif di dunia dengan laju geser 35-44 mm/tahun dari Selat Makassar hingga Teluk Bone.",
        coords: [[-0.35, 119.70], [-0.85, 119.85], [-1.35, 120.05], [-1.85, 120.30], [-2.35, 120.60]]
    },
    {
        name: "Sesar Matano & Lawanopo",
        region: "Sulawesi Tengah & Tenggara (Sorowako - Kendari)",
        type: "Sinistral Strike-Slip (Sesar Geser)",
        desc: "Melintasi Danau Matano, Danau Towuti, hingga semenanjung tenggara Sulawesi.",
        coords: [[-2.35, 120.60], [-2.60, 121.35], [-2.85, 122.10], [-3.30, 122.50], [-3.85, 122.80]]
    },
    {
        name: "Sesar Gorontalo",
        region: "Gorontalo & Sulawesi Utara",
        type: "Sinistral Strike-Slip",
        desc: "Sesar aktif memotong semenanjung utara Sulawesi dari Teluk Tomini hingga Laut Sulawesi.",
        coords: [[0.20, 122.60], [0.55, 123.00], [0.90, 123.40], [1.20, 123.75]]
    },

    // ==================== 5. MALUKU & PAPUA ====================
    {
        name: "Sesar Sorong",
        region: "Maluku Utara & Papua Barat Daya",
        type: "Sinistral Strike-Slip (Sesar Transform Raksasa)",
        desc: "Zona patahan batas lempeng Pasifik-Eurasia dari Banggai, Obi, Kepala Burung Sorong, hingga Manokwari.",
        coords: [[-1.95, 123.50], [-1.65, 126.00], [-1.30, 128.50], [-0.90, 131.25], [-0.80, 134.00]]
    },
    {
        name: "Sesar Tarera-Aiduna & Yapen",
        region: "Papua Barat & Papua Tengah",
        type: "Sinistral Strike-Slip & Thrust",
        desc: "Membentang di pesisir selatan Kepala Burung Papua (Kaimana - Teluk Cendrawasih - Nabire).",
        coords: [[-3.70, 133.20], [-3.90, 134.80], [-4.10, 136.20], [-4.25, 137.50]]
    },

    // ==================== 6. ZONA SUBDUKSI MEGATHRUST (LEMPENG TEKTONIK RAKSASA) ====================
    {
        name: "Zona Megathrust Sunda - Segmen Aceh & Sumatera Utara",
        region: "Samudra Hindia (Barat Aceh & Nias)",
        type: "Subduction Megathrust Zone",
        desc: "Zona penunjaman Lempeng Indo-Australia di bawah Lempeng Eurasia di pantai barat Aceh dan Kepulauan Nias.",
        coords: [[8.50, 93.00], [6.50, 94.20], [4.50, 95.30], [2.50, 96.50], [1.00, 97.30]],
        isMegathrust: true
    },
    {
        name: "Zona Megathrust Mentawai (Sumatera Barat & Bengkulu)",
        region: "Samudra Hindia (Kepulauan Mentawai & Enggano)",
        type: "Subduction Megathrust Zone",
        desc: "Zona megathrust sangat aktif di barat Kepulauan Mentawai, Siberut, Sipora, Pagai, hingga Pulau Enggano.",
        coords: [[1.00, 97.30], [-0.50, 98.20], [-2.00, 99.30], [-3.50, 100.60], [-5.20, 102.40]],
        isMegathrust: true
    },
    {
        name: "Zona Megathrust Selat Sunda - Jawa",
        region: "Samudra Hindia (Selatan Jawa & Bali)",
        type: "Subduction Megathrust Zone",
        desc: "Zona subduksi megathrust sepanjang selatan Banten, Jawa Barat, Jawa Tengah, Jawa Timur, hingga Bali.",
        coords: [[-5.20, 102.40], [-6.60, 104.50], [-7.80, 106.80], [-8.90, 109.50], [-9.80, 112.50], [-10.50, 115.50]],
        isMegathrust: true
    },
    {
        name: "Zona Megathrust Sumba & Nusa Tenggara",
        region: "Samudra Hindia (Selatan Lombok, Sumbawa, Sumba & Timor)",
        type: "Subduction Megathrust Zone",
        desc: "Batas lempeng penunjaman di selatan Nusa Tenggara Barat dan Nusa Tenggara Timur.",
        coords: [[-10.50, 115.50], [-11.00, 118.00], [-11.30, 121.00], [-11.50, 124.00]],
        isMegathrust: true
    },
    {
        name: "Zona Megathrust Laut Maluku & Sulawesi Utara",
        region: "Laut Sulawesi & Laut Maluku",
        type: "Double Subduction Zone",
        desc: "Zona tumbukan ganda Lempeng Laut Maluku di utara Gorontalo, Manado, dan Halmahera.",
        coords: [[1.60, 120.50], [2.10, 122.50], [2.40, 124.50], [2.10, 126.50], [1.20, 128.00]],
        isMegathrust: true
    }
];
