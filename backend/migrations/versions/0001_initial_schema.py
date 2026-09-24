"""Initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-09-25
"""

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=254), nullable=False),
    sa.Column('full_name', sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
    sa.Column('role', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('password_hash', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
    sa.Column('language', sqlmodel.sql.sqltypes.AutoString(length=5), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('failed_logins', sa.Integer(), nullable=False),
    sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('token_version', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)

    op.create_table('patients',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('pseudonym', sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
    sa.Column('source_hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_id', 'source_hash')
    )
    with op.batch_alter_table('patients', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_patients_owner_id'), ['owner_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_patients_pseudonym'), ['pseudonym'], unique=True)

    op.create_table('cases',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('patient_id', sa.Integer(), nullable=False),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('priority', sqlmodel.sql.sqltypes.AutoString(length=12), nullable=False),
    sa.Column('priority_reason', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
    sa.Column('modality', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('region', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('view', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('language', sqlmodel.sql.sqltypes.AutoString(length=5), nullable=False),
    sa.Column('image_sha256', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
    sa.Column('image_format', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=False),
    sa.Column('upload_path', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
    sa.Column('thumbnail', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('headline', sqlmodel.sql.sqltypes.AutoString(length=120), nullable=True),
    sa.Column('finding_count', sa.Integer(), nullable=False),
    sa.Column('error', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
    sa.Column('acquired_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('analyzed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('cases', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_cases_acquired_at'), ['acquired_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_cases_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_cases_image_sha256'), ['image_sha256'], unique=False)
        batch_op.create_index(batch_op.f('ix_cases_owner_id'), ['owner_id'], unique=False)
        batch_op.create_index('ix_cases_owner_status_priority', ['owner_id', 'status', 'priority'], unique=False)
        batch_op.create_index(batch_op.f('ix_cases_patient_id'), ['patient_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_cases_priority'), ['priority'], unique=False)
        batch_op.create_index(batch_op.f('ix_cases_status'), ['status'], unique=False)

    op.create_table('analyses',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('model_versions', sa.JSON(), nullable=False),
    sa.Column('raw_scores', sa.JSON(), nullable=False),
    sa.Column('summary', sa.JSON(), nullable=False),
    sa.Column('result', sa.JSON(), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('analyses', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_analyses_case_id'), ['case_id'], unique=False)

    op.create_table('audit_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=True),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
    sa.Column('action', sqlmodel.sql.sqltypes.AutoString(length=40), nullable=False),
    sa.Column('actor', sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
    sa.Column('details', sa.JSON(), nullable=False),
    sa.Column('prev_hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
    sa.Column('hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('audit_events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_audit_events_action'), ['action'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_events_case_id'), ['case_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_events_timestamp'), ['timestamp'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_events_user_id'), ['user_id'], unique=False)

    op.create_table('chat_messages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('role', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=False),
    sa.Column('content', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('language', sqlmodel.sql.sqltypes.AutoString(length=5), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.create_index('ix_chat_case_created', ['case_id', 'created_at'], unique=False)

    op.create_table('interval_summaries',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('prior_id', sa.Integer(), nullable=False),
    sa.Column('current_id', sa.Integer(), nullable=False),
    sa.Column('language', sqlmodel.sql.sqltypes.AutoString(length=5), nullable=False),
    sa.Column('summary', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('model', sqlmodel.sql.sqltypes.AutoString(length=80), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['current_id'], ['cases.id'], ),
    sa.ForeignKeyConstraint(['prior_id'], ['cases.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('prior_id', 'current_id', 'language')
    )
    op.create_table('reports',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('kind', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=False),
    sa.Column('language', sqlmodel.sql.sqltypes.AutoString(length=5), nullable=False),
    sa.Column('content', sa.JSON(), nullable=False),
    sa.Column('model', sqlmodel.sql.sqltypes.AutoString(length=80), nullable=True),
    sa.Column('error', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
    sa.Column('author_id', sa.Integer(), nullable=True),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('signed_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('reports', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_reports_case_id'), ['case_id'], unique=False)

    op.create_table('reviews',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('reviewer_id', sa.Integer(), nullable=False),
    sa.Column('action', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=False),
    sa.Column('notes', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('finding_decisions', sa.JSON(), nullable=False),
    sa.Column('added_findings', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
    sa.ForeignKeyConstraint(['reviewer_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_reviews_case_id'), ['case_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_reviews_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_reviews_reviewer_id'), ['reviewer_id'], unique=False)

    op.create_table('training_attempts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('selected', sa.JSON(), nullable=False),
    sa.Column('marks', sa.JSON(), nullable=False),
    sa.Column('reference', sa.JSON(), nullable=False),
    sa.Column('candidates', sa.JSON(), nullable=False),
    sa.Column('score', sa.Float(), nullable=False),
    sa.Column('ai_was_wrong', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('training_attempts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_training_attempts_case_id'), ['case_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_training_attempts_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_training_attempts_user_id'), ['user_id'], unique=False)

    _create_append_only_triggers()


def _create_append_only_triggers() -> None:
    """The audit log can only grow: updates and deletes are refused by the database itself."""
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$ "
            "BEGIN RAISE EXCEPTION 'audit_events is append-only'; END; $$ LANGUAGE plpgsql"
        )
        op.execute(
            "CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events "
            "FOR EACH ROW EXECUTE FUNCTION audit_events_append_only()"
        )
    else:
        for event in ("UPDATE", "DELETE"):
            op.execute(
                f"CREATE TRIGGER audit_events_no_{event.lower()} BEFORE {event} ON audit_events "
                "BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END"
            )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER audit_events_append_only ON audit_events")
        op.execute("DROP FUNCTION audit_events_append_only()")
    else:
        op.execute("DROP TRIGGER audit_events_no_update")
        op.execute("DROP TRIGGER audit_events_no_delete")
    with op.batch_alter_table('training_attempts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_training_attempts_user_id'))
        batch_op.drop_index(batch_op.f('ix_training_attempts_created_at'))
        batch_op.drop_index(batch_op.f('ix_training_attempts_case_id'))

    op.drop_table('training_attempts')
    with op.batch_alter_table('reviews', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_reviews_reviewer_id'))
        batch_op.drop_index(batch_op.f('ix_reviews_created_at'))
        batch_op.drop_index(batch_op.f('ix_reviews_case_id'))

    op.drop_table('reviews')
    with op.batch_alter_table('reports', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_reports_case_id'))

    op.drop_table('reports')
    op.drop_table('interval_summaries')
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.drop_index('ix_chat_case_created')

    op.drop_table('chat_messages')
    with op.batch_alter_table('audit_events', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_audit_events_user_id'))
        batch_op.drop_index(batch_op.f('ix_audit_events_timestamp'))
        batch_op.drop_index(batch_op.f('ix_audit_events_case_id'))
        batch_op.drop_index(batch_op.f('ix_audit_events_action'))

    op.drop_table('audit_events')
    with op.batch_alter_table('analyses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_analyses_case_id'))

    op.drop_table('analyses')
    with op.batch_alter_table('cases', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_cases_status'))
        batch_op.drop_index(batch_op.f('ix_cases_priority'))
        batch_op.drop_index(batch_op.f('ix_cases_patient_id'))
        batch_op.drop_index('ix_cases_owner_status_priority')
        batch_op.drop_index(batch_op.f('ix_cases_owner_id'))
        batch_op.drop_index(batch_op.f('ix_cases_image_sha256'))
        batch_op.drop_index(batch_op.f('ix_cases_created_at'))
        batch_op.drop_index(batch_op.f('ix_cases_acquired_at'))

    op.drop_table('cases')
    with op.batch_alter_table('patients', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_patients_pseudonym'))
        batch_op.drop_index(batch_op.f('ix_patients_owner_id'))

    op.drop_table('patients')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_email'))

    op.drop_table('users')
