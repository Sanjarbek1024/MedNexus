"""Localized names of model findings, for prompts that must write in Uzbek or Russian.

Model outputs keep their English names in the API and the audit log; the frontend has the same
glossary for the UI (frontend/src/i18n/labels.ts).
"""

FINDING_NAMES: dict[str, dict[str, str]] = {
    "uz": {
        "Atelectasis": "Atelektaz", "Consolidation": "Konsolidatsiya", "Infiltration": "Infiltratsiya",
        "Pneumothorax": "Pnevmotoraks", "Edema": "O‘pka shishi", "Emphysema": "Emfizema",
        "Fibrosis": "Fibroz", "Effusion": "Plevral suyuqlik", "Pneumonia": "Pnevmoniya",
        "Pleural thickening": "Plevra qalinlashuvi", "Cardiomegaly": "Kardiomegaliya", "Nodule": "Tugun",
        "Mass": "Hosila", "Hernia": "Churra", "Lung lesion": "O‘pkadagi o‘choq", "Fracture": "Sinish",
        "Lung opacity": "O‘pka xiralashuvi", "Enlarged cardiomediastinum": "Kardiomediastinum kengayishi",
        "Bone anomaly": "Suyak anomaliyasi", "Bone lesion": "Suyakdagi o‘choq", "Foreign body": "Yot jism",
        "Metal": "Metall (implant)", "Periosteal reaction": "Periostal reaksiya",
        "Pronator sign": "Pronator belgisi", "Soft tissue finding": "Yumshoq to‘qima o‘zgarishi",
        "Cardiothoracic ratio": "Kardiotorakal indeks", "Glioma": "Glioma", "Meningioma": "Meningioma",
        "Pituitary tumor": "Gipofiz o‘smasi", "No tumor": "O‘sma aniqlanmadi",
    },
    "ru": {
        "Atelectasis": "Ателектаз", "Consolidation": "Консолидация", "Infiltration": "Инфильтрация",
        "Pneumothorax": "Пневмоторакс", "Edema": "Отёк лёгких", "Emphysema": "Эмфизема",
        "Fibrosis": "Фиброз", "Effusion": "Плевральный выпот", "Pneumonia": "Пневмония",
        "Pleural thickening": "Утолщение плевры", "Cardiomegaly": "Кардиомегалия", "Nodule": "Узел",
        "Mass": "Образование", "Hernia": "Грыжа", "Lung lesion": "Очаг в лёгком", "Fracture": "Перелом",
        "Lung opacity": "Затемнение лёгкого",
        "Enlarged cardiomediastinum": "Расширение кардиомедиастинальной тени",
        "Bone anomaly": "Аномалия кости", "Bone lesion": "Очаг в кости", "Foreign body": "Инородное тело",
        "Metal": "Металл (имплант)", "Periosteal reaction": "Периостальная реакция",
        "Pronator sign": "Симптом пронатора", "Soft tissue finding": "Изменения мягких тканей",
        "Cardiothoracic ratio": "Кардиоторакальный индекс", "Glioma": "Глиома", "Meningioma": "Менингиома",
        "Pituitary tumor": "Опухоль гипофиза", "No tumor": "Опухоль не выявлена",
    },
}


def glossary(names: list[str], language: str) -> dict[str, str]:
    """English model finding name → its name in ``language`` (empty for English)."""
    table = FINDING_NAMES.get(language, {})
    return {name: table[name] for name in names if name in table}
