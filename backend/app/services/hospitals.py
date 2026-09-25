"""Hospital recommendations for people reading their own results.

Partner hospitals (``partner=True``) are listed first: referrals to partners are how the
patient-facing service earns money. The public specialized centers are listed by name only;
they are not partners.
"""

from __future__ import annotations

from app.schemas import Hospital, LocalizedText

SPECIALTIES = ("pulmonology", "oncology", "neurosurgery", "neurology", "traumatology", "cardiology", "general")

# Specialty for a model finding, used when no multimodal assessment is available.
FINDING_SPECIALTY = {
    "Fracture": "traumatology",
    "Glioma": "neurosurgery",
    "Meningioma": "neurosurgery",
    "Pituitary tumor": "neurosurgery",
    "Mass": "oncology",
    "Nodule": "oncology",
    "Lung Lesion": "oncology",
    "Cardiomegaly": "cardiology",
    "Enlarged Cardiomediastinum": "cardiology",
}


def _text(uz: str, en: str, ru: str) -> LocalizedText:
    return LocalizedText(uz=uz, en=en, ru=ru)


HOSPITALS: list[Hospital] = [
    Hospital(
        id="partner-demo",
        names=_text(
            "Hamkor diagnostika markazi (namuna)",
            "Partner diagnostic center (sample)",
            "Партнёрский диагностический центр (пример)",
        ),
        city="Toshkent",
        specialties=list(SPECIALTIES),
        description=_text(
            "Hamkor shifoxonalar uchun joy: bemor shu yerga yo‘naltiriladi. Demo yozuv.",
            "Slot for partner hospitals: patients are referred here. Demo entry.",
            "Место для партнёрских клиник: пациент направляется сюда. Демо-запись.",
        ),
        partner=True,
    ),
    Hospital(
        id="pulmonology-center",
        names=_text(
            "Respublika ixtisoslashtirilgan ftiziatriya va pulmonologiya ilmiy-amaliy tibbiyot markazi",
            "Republican Specialized Scientific and Practical Medical Center of Phthisiology and Pulmonology",
            "Республиканский специализированный научно-практический медицинский центр фтизиатрии и пульмонологии",
        ),
        city="Toshkent",
        specialties=["pulmonology"],
        description=_text(
            "O‘pka kasalliklari, sil va surunkali yo‘tal bo‘yicha ixtisoslashgan markaz.",
            "Specialized center for lung disease, tuberculosis and chronic cough.",
            "Специализированный центр по болезням лёгких, туберкулёзу и хроническому кашлю.",
        ),
    ),
    Hospital(
        id="oncology-center",
        names=_text(
            "Respublika ixtisoslashtirilgan onkologiya va radiologiya ilmiy-amaliy tibbiyot markazi",
            "Republican Specialized Scientific and Practical Medical Center of Oncology and Radiology",
            "Республиканский специализированный научно-практический медицинский центр онкологии и радиологии",
        ),
        city="Toshkent (viloyatlarda filiallari bor)",
        specialties=["oncology"],
        description=_text(
            "O‘smalarni aniqlash va davolash bo‘yicha asosiy markaz.",
            "Main center for diagnosing and treating tumors.",
            "Главный центр диагностики и лечения опухолей.",
        ),
    ),
    Hospital(
        id="neurosurgery-center",
        names=_text(
            "Respublika ixtisoslashtirilgan neyroxirurgiya ilmiy-amaliy tibbiyot markazi",
            "Republican Specialized Scientific and Practical Medical Center of Neurosurgery",
            "Республиканский специализированный научно-практический медицинский центр нейрохирургии",
        ),
        city="Toshkent",
        specialties=["neurosurgery", "neurology"],
        description=_text(
            "Bosh miya va umurtqa pog‘onasi kasalliklari, jumladan o‘smalar bo‘yicha markaz.",
            "Center for brain and spine conditions, including tumors.",
            "Центр заболеваний головного и спинного мозга, включая опухоли.",
        ),
    ),
    Hospital(
        id="traumatology-center",
        names=_text(
            "Respublika ixtisoslashtirilgan travmatologiya va ortopediya ilmiy-amaliy tibbiyot markazi",
            "Republican Specialized Scientific and Practical Medical Center of Traumatology and Orthopedics",
            "Республиканский специализированный научно-практический медицинский центр травматологии и ортопедии",
        ),
        city="Toshkent",
        specialties=["traumatology"],
        description=_text(
            "Suyak sinishi va bo‘g‘im jarohatlari bo‘yicha markaz.",
            "Center for fractures and joint injuries.",
            "Центр переломов и травм суставов.",
        ),
    ),
    Hospital(
        id="cardiology-center",
        names=_text(
            "Respublika ixtisoslashtirilgan kardiologiya ilmiy-amaliy tibbiyot markazi",
            "Republican Specialized Scientific and Practical Medical Center of Cardiology",
            "Республиканский специализированный научно-практический медицинский центр кардиологии",
        ),
        city="Toshkent",
        specialties=["cardiology"],
        description=_text(
            "Yurak kasalliklari bo‘yicha ixtisoslashgan markaz.",
            "Specialized center for heart disease.",
            "Специализированный центр болезней сердца.",
        ),
    ),
    Hospital(
        id="emergency-center",
        names=_text(
            "Respublika shoshilinch tibbiy yordam ilmiy markazi",
            "Republican Research Center of Emergency Medicine",
            "Республиканский научный центр экстренной медицинской помощи",
        ),
        city="Toshkent va viloyatlar",
        specialties=list(SPECIALTIES),
        description=_text(
            "Holat og‘irlashsa yoki kutib bo‘lmasa. Tez yordam: 103.",
            "When symptoms get worse or care cannot wait. Ambulance: 103.",
            "Если состояние ухудшается или помощь нельзя откладывать. Скорая помощь: 103.",
        ),
        emergency=True,
        phone="103",
    ),
    Hospital(
        id="family-clinic",
        names=_text(
            "Oilaviy poliklinika (yashash joyingiz bo‘yicha)",
            "Family polyclinic (where you live)",
            "Семейная поликлиника (по месту жительства)",
        ),
        city="Barcha hududlar",
        specialties=["general"],
        description=_text(
            "Birinchi qadam: oilaviy shifokor natijani ko‘rib, kerakli mutaxassisga yo‘naltiradi.",
            "First step: a family doctor reviews the result and refers you to the right specialist.",
            "Первый шаг: семейный врач посмотрит результат и направит к нужному специалисту.",
        ),
    ),
]


def specialty_for(finding_names: list[str]) -> str:
    for name in finding_names:
        if name in FINDING_SPECIALTY:
            return FINDING_SPECIALTY[name]
    return "pulmonology" if finding_names else "general"


def recommend(specialty: str, urgency: str = "routine", limit: int = 4) -> list[Hospital]:
    """Partners first, then centers for the specialty, then family and emergency care."""
    specialty = specialty if specialty in SPECIALTIES else "general"
    partners = [h for h in HOSPITALS if h.partner]
    emergency = [h for h in HOSPITALS if h.emergency]
    matching = [h for h in HOSPITALS if not (h.partner or h.emergency) and specialty in h.specialties]
    family = [h for h in HOSPITALS if h.id == "family-clinic"]
    ordered = partners + (emergency if urgency == "urgent" else []) + matching + family + emergency
    return list({h.id: h for h in ordered}.values())[:limit]
