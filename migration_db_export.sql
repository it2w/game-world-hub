--
-- PostgreSQL database dump
--

\restrict mfFRhhOPvaqcLGfBnutTuyOBkeNkO498xE5A53eh2Sy9lp7N81hbSwjqaXtvqYH

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activation_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activation_codes (
    id integer NOT NULL,
    code text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    duration_days integer DEFAULT 30 NOT NULL,
    max_uses integer DEFAULT 1 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    created_by integer,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activation_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activation_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activation_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activation_codes_id_seq OWNED BY public.activation_codes.id;


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocks (
    id integer NOT NULL,
    blocker_id integer NOT NULL,
    blocked_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blocks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blocks_id_seq OWNED BY public.blocks.id;


--
-- Name: content_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_links (
    id integer NOT NULL,
    user_id integer NOT NULL,
    platform text NOT NULL,
    handle text NOT NULL,
    url text,
    linked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: content_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.content_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: content_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.content_links_id_seq OWNED BY public.content_links.id;


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    user_id integer NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL
);


--
-- Name: conversation_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversation_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversation_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversation_participants_id_seq OWNED BY public.conversation_participants.id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id integer NOT NULL,
    type text DEFAULT 'direct'::text NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;


--
-- Name: friend_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_requests (
    id integer NOT NULL,
    from_user_id integer NOT NULL,
    to_user_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: friend_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.friend_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: friend_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.friend_requests_id_seq OWNED BY public.friend_requests.id;


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id integer NOT NULL,
    user_id integer NOT NULL,
    friend_id integer NOT NULL,
    since timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: friendships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.friendships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: friendships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.friendships_id_seq OWNED BY public.friendships.id;


--
-- Name: game_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_accounts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    platform text NOT NULL,
    external_id text,
    handle text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: game_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.game_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: game_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.game_accounts_id_seq OWNED BY public.game_accounts.id;


--
-- Name: games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.games (
    id integer NOT NULL,
    name text NOT NULL,
    cover_url text,
    genre text,
    platforms text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: games_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.games_id_seq OWNED BY public.games.id;


--
-- Name: lfg_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfg_posts (
    id integer NOT NULL,
    author_id integer NOT NULL,
    game text NOT NULL,
    platform text,
    rank text,
    description text NOT NULL,
    needed_players integer DEFAULT 1 NOT NULL,
    mic_required boolean DEFAULT false NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lfg_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lfg_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lfg_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lfg_posts_id_seq OWNED BY public.lfg_posts.id;


--
-- Name: lfg_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lfg_responses (
    id integer NOT NULL,
    post_id integer NOT NULL,
    user_id integer NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lfg_responses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lfg_responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lfg_responses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lfg_responses_id_seq OWNED BY public.lfg_responses.id;


--
-- Name: linked_games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linked_games (
    id integer NOT NULL,
    user_id integer NOT NULL,
    platform text NOT NULL,
    name text NOT NULL,
    cover_url text,
    app_id text,
    launch_uri text,
    source text DEFAULT 'manual'::text NOT NULL,
    playtime_minutes integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: linked_games_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.linked_games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: linked_games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.linked_games_id_seq OWNED BY public.linked_games.id;


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    id integer NOT NULL,
    message_id integer NOT NULL,
    user_id integer NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_reactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.message_reactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_reactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.message_reactions_id_seq OWNED BY public.message_reactions.id;


--
-- Name: message_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reads (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    user_id integer NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_reads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.message_reads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_reads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.message_reads_id_seq OWNED BY public.message_reads.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    sender_id integer NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reply_to_id integer,
    is_pinned boolean DEFAULT false NOT NULL,
    edited_at timestamp with time zone
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    is_read boolean DEFAULT false NOT NULL,
    related_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: owner_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_activity_log (
    id integer NOT NULL,
    action text NOT NULL,
    target_id integer,
    target_name text,
    detail text,
    owner_id integer NOT NULL,
    owner_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: owner_activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.owner_activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: owner_activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.owner_activity_log_id_seq OWNED BY public.owner_activity_log.id;


--
-- Name: parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parties (
    id integer NOT NULL,
    name text NOT NULL,
    game text,
    platform text,
    description text,
    leader_id integer NOT NULL,
    max_size integer DEFAULT 5 NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    conversation_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: parties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parties_id_seq OWNED BY public.parties.id;


--
-- Name: party_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.party_activity (
    id integer NOT NULL,
    party_id integer NOT NULL,
    actor_id integer NOT NULL,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: party_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.party_activity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: party_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.party_activity_id_seq OWNED BY public.party_activity.id;


--
-- Name: party_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.party_invites (
    id integer NOT NULL,
    party_id integer NOT NULL,
    invited_user_id integer NOT NULL,
    invited_by_user_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: party_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.party_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: party_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.party_invites_id_seq OWNED BY public.party_invites.id;


--
-- Name: party_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.party_members (
    id integer NOT NULL,
    party_id integer NOT NULL,
    user_id integer NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: party_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.party_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: party_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.party_members_id_seq OWNED BY public.party_members.id;


--
-- Name: platform_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_links (
    id integer NOT NULL,
    user_id integer NOT NULL,
    platform text NOT NULL,
    profile_url text NOT NULL,
    username text,
    linked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_links_id_seq OWNED BY public.platform_links.id;


--
-- Name: pro_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pro_subscriptions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    order_id text NOT NULL,
    provider text DEFAULT 'salla'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    amount numeric(10,2),
    currency text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pro_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pro_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pro_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pro_subscriptions_id_seq OWNED BY public.pro_subscriptions.id;


--
-- Name: profile_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_comments (
    id integer NOT NULL,
    profile_user_id integer NOT NULL,
    author_id integer NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_comments_id_seq OWNED BY public.profile_comments.id;


--
-- Name: profile_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_photos (
    id integer NOT NULL,
    user_id integer NOT NULL,
    object_path text NOT NULL,
    caption text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_photos_id_seq OWNED BY public.profile_photos.id;


--
-- Name: super_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.super_admins (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash text NOT NULL,
    email character varying(255),
    email_verified boolean DEFAULT false NOT NULL,
    password_reset_code_hash text,
    password_reset_expires_at timestamp with time zone,
    password_reset_attempts integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: super_admins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.super_admins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: super_admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.super_admins_id_seq OWNED BY public.super_admins.id;


--
-- Name: user_games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_games (
    id integer NOT NULL,
    user_id integer NOT NULL,
    game_id integer NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_games_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_games_id_seq OWNED BY public.user_games.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    bio text,
    status text DEFAULT 'offline'::text NOT NULL,
    current_game text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone,
    banner_url text,
    email text,
    email_verified boolean DEFAULT false NOT NULL,
    two_factor_method text DEFAULT 'none'::text NOT NULL,
    totp_secret text,
    allow_profile_comments boolean DEFAULT true NOT NULL,
    rank text,
    is_pro boolean DEFAULT false NOT NULL,
    pro_activated_at timestamp with time zone,
    pro_expires_at timestamp with time zone,
    pro_order_id text,
    pro_provider text DEFAULT 'salla'::text NOT NULL,
    is_admin boolean DEFAULT false NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: verification_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_codes (
    id integer NOT NULL,
    user_id integer NOT NULL,
    purpose text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: verification_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verification_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verification_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verification_codes_id_seq OWNED BY public.verification_codes.id;


--
-- Name: activation_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes ALTER COLUMN id SET DEFAULT nextval('public.activation_codes_id_seq'::regclass);


--
-- Name: blocks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks ALTER COLUMN id SET DEFAULT nextval('public.blocks_id_seq'::regclass);


--
-- Name: content_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_links ALTER COLUMN id SET DEFAULT nextval('public.content_links_id_seq'::regclass);


--
-- Name: conversation_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants ALTER COLUMN id SET DEFAULT nextval('public.conversation_participants_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);


--
-- Name: friend_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests ALTER COLUMN id SET DEFAULT nextval('public.friend_requests_id_seq'::regclass);


--
-- Name: friendships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships ALTER COLUMN id SET DEFAULT nextval('public.friendships_id_seq'::regclass);


--
-- Name: game_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_accounts ALTER COLUMN id SET DEFAULT nextval('public.game_accounts_id_seq'::regclass);


--
-- Name: games id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games ALTER COLUMN id SET DEFAULT nextval('public.games_id_seq'::regclass);


--
-- Name: lfg_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfg_posts ALTER COLUMN id SET DEFAULT nextval('public.lfg_posts_id_seq'::regclass);


--
-- Name: lfg_responses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfg_responses ALTER COLUMN id SET DEFAULT nextval('public.lfg_responses_id_seq'::regclass);


--
-- Name: linked_games id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linked_games ALTER COLUMN id SET DEFAULT nextval('public.linked_games_id_seq'::regclass);


--
-- Name: message_reactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions ALTER COLUMN id SET DEFAULT nextval('public.message_reactions_id_seq'::regclass);


--
-- Name: message_reads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads ALTER COLUMN id SET DEFAULT nextval('public.message_reads_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: owner_activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_activity_log ALTER COLUMN id SET DEFAULT nextval('public.owner_activity_log_id_seq'::regclass);


--
-- Name: parties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties ALTER COLUMN id SET DEFAULT nextval('public.parties_id_seq'::regclass);


--
-- Name: party_activity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_activity ALTER COLUMN id SET DEFAULT nextval('public.party_activity_id_seq'::regclass);


--
-- Name: party_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_invites ALTER COLUMN id SET DEFAULT nextval('public.party_invites_id_seq'::regclass);


--
-- Name: party_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_members ALTER COLUMN id SET DEFAULT nextval('public.party_members_id_seq'::regclass);


--
-- Name: platform_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_links ALTER COLUMN id SET DEFAULT nextval('public.platform_links_id_seq'::regclass);


--
-- Name: pro_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.pro_subscriptions_id_seq'::regclass);


--
-- Name: profile_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_comments ALTER COLUMN id SET DEFAULT nextval('public.profile_comments_id_seq'::regclass);


--
-- Name: profile_photos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_photos ALTER COLUMN id SET DEFAULT nextval('public.profile_photos_id_seq'::regclass);


--
-- Name: super_admins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_admins ALTER COLUMN id SET DEFAULT nextval('public.super_admins_id_seq'::regclass);


--
-- Name: user_games id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_games ALTER COLUMN id SET DEFAULT nextval('public.user_games_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: verification_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_codes ALTER COLUMN id SET DEFAULT nextval('public.verification_codes_id_seq'::regclass);


--
-- Data for Name: activation_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.activation_codes (id, code, status, duration_days, max_uses, used_count, created_by, expires_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: blocks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.blocks (id, blocker_id, blocked_id, created_at) FROM stdin;
3	18	20	2026-07-14 02:19:57.584344+00
\.


--
-- Data for Name: content_links; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.content_links (id, user_id, platform, handle, url, linked_at) FROM stdin;
2	1	youtube	GhostXTV	https://youtube.com/@GhostXTV	2026-07-13 23:16:42.453985+00
4	2	kick	nova	\N	2026-07-13 23:16:42.47492+00
5	2	tiktok	@nova.fx	\N	2026-07-13 23:16:42.487958+00
7	6	twitch	ررلالا	\N	2026-07-13 23:29:10.6389+00
8	6	youtube	ؤررر	\N	2026-07-13 23:29:19.768694+00
9	6	tiktok	رءرءؤر	\N	2026-07-13 23:29:35.883341+00
10	6	kick	لارىرىرى	\N	2026-07-13 23:29:50.978622+00
1	1	twitch	ghostx_official	\N	2026-07-13 23:33:45.704+00
\.


--
-- Data for Name: conversation_participants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversation_participants (id, conversation_id, user_id, joined_at, is_hidden) FROM stdin;
1	1	1	2026-07-13 20:42:37.863261+00	f
2	1	2	2026-07-13 20:42:37.863261+00	f
3	1	3	2026-07-13 20:42:37.863261+00	f
4	2	1	2026-07-13 20:42:37.882486+00	f
5	2	2	2026-07-13 20:42:37.882486+00	f
9	4	5	2026-07-13 23:58:15.466281+00	f
10	4	4	2026-07-13 23:58:15.466281+00	f
13	6	6	2026-07-14 00:07:45.08511+00	f
375	65	6	2026-07-16 04:40:24.182886+00	f
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversations (id, type, name, created_at) FROM stdin;
1	party	Valorant Ranked Run	2026-07-13 20:42:37.86059+00
2	direct	\N	2026-07-13 20:42:37.879282+00
3	party	it2	2026-07-13 23:55:50.038705+00
4	direct	\N	2026-07-13 23:58:15.462002+00
5	party	هعع	2026-07-13 23:58:39.817742+00
6	party	fgdf	2026-07-14 00:07:45.08095+00
34	party	Kamala	2026-07-15 02:50:06.912791+00
65	party	سبببب	2026-07-16 04:40:24.177808+00
\.


--
-- Data for Name: friend_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.friend_requests (id, from_user_id, to_user_id, status, created_at) FROM stdin;
2	6	2	pending	2026-07-13 23:25:37.912586+00
3	4	5	accepted	2026-07-13 23:39:55.473573+00
4	6	3	pending	2026-07-13 23:41:45.32239+00
5	6	1	pending	2026-07-13 23:55:04.196507+00
6	4	5	accepted	2026-07-13 23:58:15.343005+00
7	35	34	accepted	2026-07-14 02:55:23.582922+00
8	37	36	pending	2026-07-14 02:55:51.659768+00
9	39	38	accepted	2026-07-14 02:56:24.438802+00
10	41	40	accepted	2026-07-14 02:57:07.012455+00
\.


--
-- Data for Name: friendships; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.friendships (id, user_id, friend_id, since) FROM stdin;
1	1	2	2026-07-13 20:42:37.854249+00
2	2	1	2026-07-13 20:42:37.854249+00
3	1	3	2026-07-13 20:42:37.854249+00
4	3	1	2026-07-13 20:42:37.854249+00
5	2	4	2026-07-13 20:42:37.854249+00
6	4	2	2026-07-13 20:42:37.854249+00
7	1	5	2026-07-13 20:42:37.854249+00
8	5	1	2026-07-13 20:42:37.854249+00
13	34	35	2026-07-14 02:55:23.605813+00
14	35	34	2026-07-14 02:55:23.605813+00
15	38	39	2026-07-14 02:56:24.455558+00
16	39	38	2026-07-14 02:56:24.455558+00
17	40	41	2026-07-14 02:57:07.028446+00
18	41	40	2026-07-14 02:57:07.028446+00
\.


--
-- Data for Name: game_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.game_accounts (id, user_id, platform, external_id, handle, created_at) FROM stdin;
2	6	epic	\N	fgh	2026-07-14 00:27:19.520901+00
3	1	battlenet	\N	ghosty	2026-07-14 00:27:20.91483+00
4	6	battlenet	\N	sddd	2026-07-14 00:31:44.938249+00
7	6	steam	76561198153374900	\N	2026-07-14 01:11:45.637023+00
\.


--
-- Data for Name: games; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.games (id, name, cover_url, genre, platforms, created_at) FROM stdin;
1	Valorant	\N	FPS	{PC}	2026-07-13 20:42:37.841383+00
2	Elden Ring	\N	RPG	{PC,PlayStation,Xbox}	2026-07-13 20:42:37.841383+00
3	Call of Duty: Warzone	\N	Battle Royale	{PC,PlayStation,Xbox}	2026-07-13 20:42:37.841383+00
4	League of Legends	\N	MOBA	{PC}	2026-07-13 20:42:37.841383+00
5	Fortnite	\N	Battle Royale	{PC,PlayStation,Xbox,Nintendo}	2026-07-13 20:42:37.841383+00
6	Minecraft	\N	Sandbox	{PC,PlayStation,Xbox,Nintendo}	2026-07-13 20:42:37.841383+00
7	Apex Legends	\N	Battle Royale	{PC,PlayStation,Xbox}	2026-07-13 20:42:37.841383+00
8	Rocket League	\N	Sports	{PC,PlayStation,Xbox,Nintendo}	2026-07-13 20:42:37.841383+00
9	GTA Online	\N	Action	{PC,PlayStation,Xbox}	2026-07-13 20:42:37.841383+00
10	Cyberpunk 2077	\N	RPG	{PC,PlayStation,Xbox}	2026-07-13 20:42:37.841383+00
\.


--
-- Data for Name: lfg_posts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lfg_posts (id, author_id, game, platform, rank, description, needed_players, mic_required, status, expires_at, created_at) FROM stdin;
1	1	Valorant	PC	Diamond	Need 2 for ranked, chill vibes	2	t	closed	2026-07-14 10:31:46.43+00	2026-07-13 22:31:46.432225+00
2	1	bVNRdL	PC		test briefing bVNRdL	3	t	open	2026-07-14 04:34:21.453+00	2026-07-13 22:34:21.453856+00
3	1	g6jAES	PC		root retest g6jAES	3	t	closed	2026-07-14 04:42:42.776+00	2026-07-13 22:42:42.777744+00
4	1	IDEMPO-ncit2y	PC	\N	race test	1	t	open	\N	2026-07-13 22:48:17.298316+00
5	1	EXP-7pych	PC	\N	guard test	1	f	open	2026-07-13 22:01:30.908132+00	2026-07-13 23:01:16.486575+00
102	263	E2E Game mrlj9r7wfjir			E2E test signal — please ignore	1	f	closed	2026-07-15 04:11:41.408+00	2026-07-15 03:41:41.409416+00
103	265	E2E Closed mrlja6sxg065			E2E test signal — please ignore	1	f	closed	2026-07-15 04:11:55.945+00	2026-07-15 03:41:55.948975+00
105	269	FilterGameA_mrljapkfwy2n			E2E test signal — please ignore	1	f	open	2026-07-15 04:12:18.988+00	2026-07-15 03:42:18.989012+00
106	269	FilterGameB_mrljapkftz7v			E2E test signal — please ignore	1	f	open	2026-07-15 04:12:20.198+00	2026-07-15 03:42:20.199442+00
30	127	E2E Game mrld0v88utos			E2E test signal — please ignore	1	f	closed	2026-07-15 01:16:44.803+00	2026-07-15 00:46:44.804012+00
31	129	E2E Closed mrld15vhw4a5			E2E test signal — please ignore	1	f	closed	2026-07-15 01:16:56.024+00	2026-07-15 00:46:56.025896+00
32	131	FilterGameA_mrld1focpv48			E2E test signal — please ignore	1	f	open	2026-07-15 01:17:09.195+00	2026-07-15 00:47:09.196456+00
33	131	FilterGameB_mrld1focv9op			E2E test signal — please ignore	1	f	open	2026-07-15 01:17:10.478+00	2026-07-15 00:47:10.485015+00
34	132	E2E Game mrld2ilkcylo			E2E test signal — please ignore	1	f	closed	2026-07-15 01:17:59.845+00	2026-07-15 00:47:59.848777+00
35	134	E2E Closed mrld2sa6gi6k			E2E test signal — please ignore	1	f	closed	2026-07-15 01:18:12.268+00	2026-07-15 00:48:12.27053+00
36	136	FilterGameA_mrld31prxvfz			E2E test signal — please ignore	1	f	open	2026-07-15 01:18:23.99+00	2026-07-15 00:48:23.990784+00
37	136	FilterGameB_mrld31pr2v6o			E2E test signal — please ignore	1	f	open	2026-07-15 01:18:25.231+00	2026-07-15 00:48:25.231968+00
115	287	E2E Game mrlo3rse4aws			E2E test signal — please ignore	1	f	closed	2026-07-15 06:26:55.864+00	2026-07-15 05:56:55.865586+00
116	289	E2E Closed mrlo42y0ocnx			E2E test signal — please ignore	1	f	closed	2026-07-15 06:27:07.504+00	2026-07-15 05:57:07.504688+00
118	293	FilterGameA_mrlo4hmioll0			E2E test signal — please ignore	1	f	open	2026-07-15 06:27:26.64+00	2026-07-15 05:57:26.641093+00
119	293	FilterGameB_mrlo4hmikfl9			E2E test signal — please ignore	1	f	open	2026-07-15 06:27:27.75+00	2026-07-15 05:57:27.750637+00
38	140	E2E Game mrld4o03nacf			E2E test signal — please ignore	1	f	closed	2026-07-15 01:19:41.88+00	2026-07-15 00:49:41.917244+00
45	154	E2E Closed mrld5afh940k			E2E test signal — please ignore	1	f	closed	2026-07-15 01:20:09.055+00	2026-07-15 00:50:09.055993+00
46	156	FilterGameA_mrld5krw98f9			E2E test signal — please ignore	1	f	open	2026-07-15 01:20:22.282+00	2026-07-15 00:50:22.28257+00
47	156	FilterGameB_mrld5krwkyvq			E2E test signal — please ignore	1	f	open	2026-07-15 01:20:23.491+00	2026-07-15 00:50:23.492403+00
48	157	E2E Game mrldjctq12lo			E2E test signal — please ignore	1	f	closed	2026-07-15 01:31:07.851+00	2026-07-15 01:01:07.852074+00
49	159	E2E Closed mrldjol9a58h			E2E test signal — please ignore	1	f	closed	2026-07-15 01:31:20.899+00	2026-07-15 01:01:20.900274+00
50	161	FilterGameA_mrldjyw79a58			E2E test signal — please ignore	1	f	open	2026-07-15 01:31:34.025+00	2026-07-15 01:01:34.026571+00
51	161	FilterGameB_mrldjyw7chw1			E2E test signal — please ignore	1	f	open	2026-07-15 01:31:35.553+00	2026-07-15 01:01:35.554456+00
52	165	E2E Game mrldkyjdomiv			E2E test signal — please ignore	1	f	closed	2026-07-15 01:32:22.918+00	2026-07-15 01:02:22.965875+00
59	179	E2E Closed mrldlk4hfzs0			E2E test signal — please ignore	1	f	closed	2026-07-15 01:32:48.173+00	2026-07-15 01:02:48.17374+00
60	181	FilterGameA_mrldlu8244c9			E2E test signal — please ignore	1	f	open	2026-07-15 01:33:01.561+00	2026-07-15 01:03:01.562161+00
61	181	FilterGameB_mrldlu82izkf			E2E test signal — please ignore	1	f	open	2026-07-15 01:33:02.886+00	2026-07-15 01:03:02.88675+00
128	308	E2E Game mrm0yotaszwa			E2E test signal — please ignore	1	f	closed	2026-07-15 12:26:56.098+00	2026-07-15 11:56:56.099527+00
129	313	E2E Closed mrm0z1k58sin			E2E test signal — please ignore	1	f	closed	2026-07-15 12:27:07.151+00	2026-07-15 11:57:07.152249+00
131	317	FilterGameA_mrm0zfy86k2u			E2E test signal — please ignore	1	f	open	2026-07-15 12:27:26.097+00	2026-07-15 11:57:26.104381+00
132	317	FilterGameB_mrm0zfy8bvgq			E2E test signal — please ignore	1	f	open	2026-07-15 12:27:27.121+00	2026-07-15 11:57:27.121844+00
74	212	E2E Game mrldqn5yi9hd			E2E test signal — please ignore	1	f	closed	2026-07-15 01:36:50.086+00	2026-07-15 01:06:50.089083+00
75	214	E2E Closed mrldr258watu			E2E test signal — please ignore	1	f	closed	2026-07-15 01:37:04.947+00	2026-07-15 01:07:04.949847+00
76	216	FilterGameA_mrldrcczlxnp			E2E test signal — please ignore	1	f	open	2026-07-15 01:37:17.989+00	2026-07-15 01:07:17.990337+00
77	216	FilterGameB_mrldrcczt78h			E2E test signal — please ignore	1	f	open	2026-07-15 01:37:19.39+00	2026-07-15 01:07:19.393479+00
78	217	E2E Game mrldw0bc8y9t			E2E test signal — please ignore	1	f	closed	2026-07-15 01:40:56.383+00	2026-07-15 01:10:56.384639+00
79	219	E2E Closed mrldwaokbcd5			E2E test signal — please ignore	1	f	closed	2026-07-15 01:41:09.179+00	2026-07-15 01:11:09.180812+00
81	223	FilterGameA_mrldwuk68rim			E2E test signal — please ignore	1	f	open	2026-07-15 01:41:34.806+00	2026-07-15 01:11:34.807146+00
82	223	FilterGameB_mrldwuk6ztfq			E2E test signal — please ignore	1	f	open	2026-07-15 01:41:36.442+00	2026-07-15 01:11:36.44327+00
141	335	E2E Game mrmil01j6qfw			E2E test signal — please ignore	1	f	closed	2026-07-15 20:40:09.251+00	2026-07-15 20:10:09.257095+00
89	230	E2E Game mrldyka3ke35			E2E test signal — please ignore	1	f	closed	2026-07-15 01:42:59.262+00	2026-07-15 01:12:59.492811+00
90	241	E2E Closed mrldz329c966			E2E test signal — please ignore	1	f	closed	2026-07-15 01:43:19.25+00	2026-07-15 01:13:19.25085+00
92	245	FilterGameA_mrldzmi19aao			E2E test signal — please ignore	1	f	open	2026-07-15 01:43:44.388+00	2026-07-15 01:13:44.38856+00
93	245	FilterGameB_mrldzmi1in4h			E2E test signal — please ignore	1	f	open	2026-07-15 01:43:45.898+00	2026-07-15 01:13:45.89894+00
142	337	E2E Closed mrmilatpj309			E2E test signal — please ignore	1	f	closed	2026-07-15 20:40:19.22+00	2026-07-15 20:10:19.221381+00
144	341	FilterGameA_mrmilp9bo4ii			E2E test signal — please ignore	1	f	open	2026-07-15 20:40:37.923+00	2026-07-15 20:10:37.923868+00
145	341	FilterGameB_mrmilp9bb2v0			E2E test signal — please ignore	1	f	open	2026-07-15 20:40:38.908+00	2026-07-15 20:10:38.909529+00
154	359	E2E Game mrmn3naff7em			E2E test signal — please ignore	1	f	closed	2026-07-15 22:46:38.479+00	2026-07-15 22:16:38.782324+00
155	361	E2E Closed mrmn3yydwrhi			E2E test signal — please ignore	1	f	closed	2026-07-15 22:46:49.068+00	2026-07-15 22:16:49.06907+00
157	365	FilterGameA_mrmn4f1l07uz			E2E test signal — please ignore	1	f	open	2026-07-15 22:47:10.024+00	2026-07-15 22:17:10.026143+00
158	365	FilterGameB_mrmn4f1lr32z			E2E test signal — please ignore	1	f	open	2026-07-15 22:47:11.061+00	2026-07-15 22:17:11.062182+00
199	457	E2E Game mrmvg5wbv8im			E2E test signal — please ignore	1	f	closed	2026-07-16 02:40:18.242+00	2026-07-16 02:10:18.245472+00
200	459	E2E Closed mrmvgh07dz1w			E2E test signal — please ignore	1	f	closed	2026-07-16 02:40:29.229+00	2026-07-16 02:10:29.23018+00
202	463	FilterGameA_mrmvgvp0h43n			E2E test signal — please ignore	1	f	open	2026-07-16 02:40:47.977+00	2026-07-16 02:10:47.978515+00
203	463	FilterGameB_mrmvgvp0uw3r			E2E test signal — please ignore	1	f	open	2026-07-16 02:40:48.992+00	2026-07-16 02:10:48.997522+00
212	481	E2E Game mrnny2cwec2g			E2E test signal — please ignore	1	f	closed	2026-07-16 15:58:03.009+00	2026-07-16 15:28:03.026678+00
213	483	E2E Closed mrnnydhcu5df			E2E test signal — please ignore	1	f	closed	2026-07-16 15:58:13.539+00	2026-07-16 15:28:13.541012+00
215	487	FilterGameA_mrnnyrsc65qh			E2E test signal — please ignore	1	f	open	2026-07-16 15:58:31.909+00	2026-07-16 15:28:31.910408+00
216	487	FilterGameB_mrnnyrsck9el			E2E test signal — please ignore	1	f	open	2026-07-16 15:58:32.872+00	2026-07-16 15:28:32.874195+00
\.


--
-- Data for Name: lfg_responses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lfg_responses (id, post_id, user_id, message, created_at) FROM stdin;
1	1	2	im down	2026-07-13 22:32:11.976406+00
2	2	6	\N	2026-07-13 22:39:44.141628+00
3	3	6	\N	2026-07-13 22:42:54.434062+00
4	3	2	\N	2026-07-13 22:43:10.750617+00
5	4	2	\N	2026-07-13 22:48:17.479903+00
11	4	6	\N	2026-07-13 22:54:47.284584+00
12	5	2	\N	2026-07-13 23:01:16.555996+00
13	5	6	\N	2026-07-13 23:01:27.187261+00
38	30	128	\N	2026-07-15 00:46:49.15971+00
39	34	133	\N	2026-07-15 00:48:04.173896+00
46	38	153	\N	2026-07-15 00:49:59.680618+00
47	48	158	\N	2026-07-15 01:01:12.343147+00
161	199	458	\N	2026-07-16 02:10:22.628883+00
54	52	178	\N	2026-07-15 01:02:39.010806+00
170	212	482	\N	2026-07-16 15:28:07.007261+00
67	74	213	\N	2026-07-15 01:06:55.605791+00
68	78	218	\N	2026-07-15 01:11:01.017571+00
75	89	237	\N	2026-07-15 01:13:10.159059+00
84	102	264	\N	2026-07-15 03:41:47.011434+00
93	115	288	\N	2026-07-15 05:57:00.213894+00
102	128	312	\N	2026-07-15 11:57:00.509144+00
111	141	336	\N	2026-07-15 20:10:13.3251+00
120	154	360	\N	2026-07-15 22:16:42.752994+00
\.


--
-- Data for Name: linked_games; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.linked_games (id, user_id, platform, name, cover_url, app_id, launch_uri, source, playtime_minutes, created_at) FROM stdin;
2532	6	steam	Counter-Strike 2	https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg	730	\N	steam	579	2026-07-14 18:46:21.072759+00
2533	6	steam	Batman: Arkham Asylum GOTY Edition	https://cdn.cloudflare.steamstatic.com/steam/apps/35140/header.jpg	35140	\N	steam	1	2026-07-14 18:46:21.072759+00
2534	6	steam	Batman: Arkham City GOTY	https://cdn.cloudflare.steamstatic.com/steam/apps/200260/header.jpg	200260	\N	steam	0	2026-07-14 18:46:21.072759+00
2535	6	steam	Serious Sam 2	https://cdn.cloudflare.steamstatic.com/steam/apps/204340/header.jpg	204340	\N	steam	0	2026-07-14 18:46:21.072759+00
2536	6	steam	Batman™: Arkham Knight	https://cdn.cloudflare.steamstatic.com/steam/apps/208650/header.jpg	208650	\N	steam	55	2026-07-14 18:46:21.072759+00
2537	6	steam	Euro Truck Simulator 2	https://cdn.cloudflare.steamstatic.com/steam/apps/227300/header.jpg	227300	\N	steam	193	2026-07-14 18:46:21.072759+00
2538	6	steam	Outlast	https://cdn.cloudflare.steamstatic.com/steam/apps/238320/header.jpg	238320	\N	steam	16	2026-07-14 18:46:21.072759+00
2539	6	steam	Assetto Corsa	https://cdn.cloudflare.steamstatic.com/steam/apps/244210/header.jpg	244210	\N	steam	1514	2026-07-14 18:46:21.072759+00
2540	6	steam	Rust	https://cdn.cloudflare.steamstatic.com/steam/apps/252490/header.jpg	252490	\N	steam	209	2026-07-14 18:46:21.072759+00
2541	6	steam	The Witcher 3: Wild Hunt	https://cdn.cloudflare.steamstatic.com/steam/apps/292030/header.jpg	292030	\N	steam	1081	2026-07-14 18:46:21.072759+00
2542	6	steam	Call to Arms	https://cdn.cloudflare.steamstatic.com/steam/apps/302670/header.jpg	302670	\N	steam	30	2026-07-14 18:46:21.072759+00
2543	6	steam	Tom Clancy's Rainbow Six Siege	https://cdn.cloudflare.steamstatic.com/steam/apps/359550/header.jpg	359550	\N	steam	565	2026-07-14 18:46:21.072759+00
2544	6	steam	Outlast 2	https://cdn.cloudflare.steamstatic.com/steam/apps/414700/header.jpg	414700	\N	steam	0	2026-07-14 18:46:21.072759+00
2545	6	steam	Wallpaper Engine	https://cdn.cloudflare.steamstatic.com/steam/apps/431960/header.jpg	431960	\N	steam	3738	2026-07-14 18:46:21.072759+00
2546	6	steam	Darwin Project	https://cdn.cloudflare.steamstatic.com/steam/apps/544920/header.jpg	544920	\N	steam	16	2026-07-14 18:46:21.072759+00
2547	6	steam	Tom Clancy's Rainbow Six Siege - Test Server	https://cdn.cloudflare.steamstatic.com/steam/apps/623990/header.jpg	623990	\N	steam	6	2026-07-14 18:46:21.072759+00
2548	6	steam	Fog Of War - Free Edition	https://cdn.cloudflare.steamstatic.com/steam/apps/691020/header.jpg	691020	\N	steam	14	2026-07-14 18:46:21.072759+00
2549	6	steam	Rust - Staging Branch	https://cdn.cloudflare.steamstatic.com/steam/apps/700580/header.jpg	700580	\N	steam	13	2026-07-14 18:46:21.072759+00
2550	6	steam	Albion Online	https://cdn.cloudflare.steamstatic.com/steam/apps/761890/header.jpg	761890	\N	steam	47	2026-07-14 18:46:21.072759+00
2551	6	steam	Battle Tanks: World War II	https://cdn.cloudflare.steamstatic.com/steam/apps/782670/header.jpg	782670	\N	steam	18	2026-07-14 18:46:21.072759+00
2552	6	steam	HITMAN™ 2	https://cdn.cloudflare.steamstatic.com/steam/apps/863550/header.jpg	863550	\N	steam	0	2026-07-14 18:46:21.072759+00
2553	6	steam	War Rock	https://cdn.cloudflare.steamstatic.com/steam/apps/880850/header.jpg	880850	\N	steam	19	2026-07-14 18:46:21.072759+00
2554	6	steam	CombatArms: Reloaded	https://cdn.cloudflare.steamstatic.com/steam/apps/905640/header.jpg	905640	\N	steam	18	2026-07-14 18:46:21.072759+00
2555	6	steam	Modern Combat 5	https://cdn.cloudflare.steamstatic.com/steam/apps/921060/header.jpg	921060	\N	steam	36	2026-07-14 18:46:21.072759+00
2556	6	steam	Hogwarts Legacy	https://cdn.cloudflare.steamstatic.com/steam/apps/990080/header.jpg	990080	\N	steam	6852	2026-07-14 18:46:21.072759+00
2557	6	steam	Game of Thrones Winter is Coming	https://cdn.cloudflare.steamstatic.com/steam/apps/1105420/header.jpg	1105420	\N	steam	44	2026-07-14 18:46:21.072759+00
2558	6	steam	Apex Legends	https://cdn.cloudflare.steamstatic.com/steam/apps/1172470/header.jpg	1172470	\N	steam	40	2026-07-14 18:46:21.072759+00
2559	6	steam	Sea of Thieves	https://cdn.cloudflare.steamstatic.com/steam/apps/1172620/header.jpg	1172620	\N	steam	64981	2026-07-14 18:46:21.072759+00
2560	6	steam	Red Dead Redemption 2	https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/header.jpg	1174180	\N	steam	113	2026-07-14 18:46:21.072759+00
2561	6	steam	Stay Out	https://cdn.cloudflare.steamstatic.com/steam/apps/1180380/header.jpg	1180380	\N	steam	12	2026-07-14 18:46:21.072759+00
2562	6	steam	Halo Infinite	https://cdn.cloudflare.steamstatic.com/steam/apps/1240440/header.jpg	1240440	\N	steam	68	2026-07-14 18:46:21.072759+00
2563	6	steam	The Outlast Trials	https://cdn.cloudflare.steamstatic.com/steam/apps/1304930/header.jpg	1304930	\N	steam	184	2026-07-14 18:46:21.072759+00
2564	6	steam	Animaze	https://cdn.cloudflare.steamstatic.com/steam/apps/1364390/header.jpg	1364390	\N	steam	50	2026-07-14 18:46:21.072759+00
2565	6	steam	Stumble Guys	https://cdn.cloudflare.steamstatic.com/steam/apps/1677740/header.jpg	1677740	\N	steam	3390	2026-07-14 18:46:21.072759+00
\.


--
-- Data for Name: message_reactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.message_reactions (id, message_id, user_id, emoji, created_at) FROM stdin;
\.


--
-- Data for Name: message_reads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.message_reads (id, conversation_id, user_id, last_read_at) FROM stdin;
6	65	6	2026-07-16 04:43:02.792+00
4	6	6	2026-07-16 04:43:18.235+00
3	3	6	2026-07-16 04:06:27.195+00
5	34	6	2026-07-16 04:32:10.677+00
1	1	6	2026-07-16 04:39:51.347+00
2	5	6	2026-07-16 04:17:54.056+00
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.messages (id, conversation_id, sender_id, content, created_at, reply_to_id, is_pinned, edited_at) FROM stdin;
1	1	1	anyone wanna run ranked?	2026-07-13 20:42:37.876517+00	\N	f	\N
2	1	2	im in, give me 5 mins	2026-07-13 20:42:37.876517+00	\N	f	\N
3	1	3	ready when you are	2026-07-13 20:42:37.876517+00	\N	f	\N
4	2	2	yo you gonna be on tonight?	2026-07-13 20:42:37.884806+00	\N	f	\N
5	2	1	yeah for sure, around 8pm	2026-07-13 20:42:37.884806+00	\N	f	\N
6	1	6	ع	2026-07-13 22:25:56.86853+00	\N	f	\N
7	1	6	مرحبا	2026-07-13 22:26:04.194571+00	\N	f	\N
9	4	5	hi again	2026-07-13 23:58:15.550713+00	\N	f	\N
95	3	6	iouio	2026-07-16 04:02:14.696577+00	\N	f	\N
96	3	6	hghfgh	2026-07-16 04:02:26.543491+00	95	f	2026-07-16 04:02:39.036+00
97	34	6	`code`	2026-07-16 04:12:06.056809+00	\N	f	\N
99	6	6	اااااااااااااااااااتتتتنم	2026-07-16 04:23:24.876804+00	\N	f	\N
100	6	6	555	2026-07-16 04:32:45.477354+00	\N	f	\N
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, type, title, body, is_read, related_id, created_at) FROM stdin;
1	1	friend_request	Viper sent you a friend request	\N	f	1	2026-07-13 20:42:37.8871+00
2	1	message	Nova: yo you gonna be on tonight?	\N	f	2	2026-07-13 20:42:37.8871+00
3	1	message	New message from n	\N	f	1	2026-07-13 22:25:56.874499+00
4	2	message	New message from n	\N	f	1	2026-07-13 22:25:56.875272+00
5	3	message	New message from n	\N	f	1	2026-07-13 22:25:56.884943+00
6	1	message	New message from n	\N	f	1	2026-07-13 22:26:04.200099+00
7	3	message	New message from n	\N	f	1	2026-07-13 22:26:04.200772+00
8	2	message	New message from n	\N	f	1	2026-07-13 22:26:04.200837+00
9	1	lfg_response	Nova wants to squad up for Valorant	im down	f	1	2026-07-13 22:32:11.980413+00
10	1	lfg_response	n wants to squad up for bVNRdL	\N	f	2	2026-07-13 22:39:44.150233+00
11	1	lfg_response	n wants to squad up for g6jAES	\N	f	3	2026-07-13 22:42:54.4476+00
12	1	lfg_response	Nova wants to squad up for g6jAES	\N	f	3	2026-07-13 22:43:10.764684+00
13	1	lfg_response	Nova wants to squad up for IDEMPO-ncit2y	\N	f	4	2026-07-13 22:48:17.504062+00
14	1	lfg_response	n wants to squad up for IDEMPO-ncit2y	\N	f	4	2026-07-13 22:54:47.292121+00
15	1	message	New message from naf	\N	f	1	2026-07-13 23:00:16.787308+00
16	3	message	New message from naf	\N	f	1	2026-07-13 23:00:16.787634+00
17	2	message	New message from naf	\N	f	1	2026-07-13 23:00:16.787658+00
18	1	lfg_response	Nova wants to squad up for EXP-7pych	\N	f	5	2026-07-13 23:01:16.560865+00
19	1	lfg_response	naf wants to squad up for EXP-7pych	\N	f	5	2026-07-13 23:01:27.193889+00
20	2	friend_request	naf sent you a friend request	\N	f	2	2026-07-13 23:25:37.936837+00
21	5	friend_request	Viper sent you a friend request	\N	f	3	2026-07-13 23:39:55.479801+00
22	3	friend_request	naf sent you a friend request	\N	f	4	2026-07-13 23:41:45.357979+00
23	1	friend_request	naf sent you a friend request	\N	f	5	2026-07-13 23:55:04.206065+00
156	263	lfg_response	rsp mrlj9r7w6mv1 wants to squad up for E2E Game mrlj9r7wfjir	\N	f	102	2026-07-15 03:41:47.01756+00
25	4	message	New message from Storm	\N	f	4	2026-07-13 23:58:15.555819+00
26	3	party_invite	Ghost invited you to a party	\N	f	1	2026-07-14 00:01:34.839606+00
27	4	party_invite	Ghost invited you to a party	\N	f	2	2026-07-14 00:05:34.194917+00
28	3	party_invite	naf invited you to a party	\N	f	3	2026-07-14 00:08:01.063241+00
29	3	party_invite	naf invited you to a party	\N	f	4	2026-07-14 00:08:07.512024+00
177	287	lfg_response	rsp mrlo3rse6kf0 wants to squad up for E2E Game mrlo3rse4aws	\N	f	115	2026-07-15 05:57:00.227257+00
240	359	lfg_response	rsp mrmn3nafbbjy wants to squad up for E2E Game mrmn3naff7em	\N	f	154	2026-07-15 22:16:42.759585+00
119	212	lfg_response	rsp mrldqn5yzgfj wants to squad up for E2E Game mrldqn5yi9hd	\N	f	74	2026-07-15 01:06:55.609936+00
58	127	lfg_response	rsp mrld0v88n1q7 wants to squad up for E2E Game mrld0v88utos	\N	f	30	2026-07-15 00:46:49.164352+00
59	132	lfg_response	rsp mrld2ilkm2k0 wants to squad up for E2E Game mrld2ilkcylo	\N	f	34	2026-07-15 00:48:04.23072+00
120	217	lfg_response	rsp mrldw0bcnzlk wants to squad up for E2E Game mrldw0bc8y9t	\N	f	78	2026-07-15 01:11:01.027288+00
74	140	lfg_response	rsp mrld4o034p5a wants to squad up for E2E Game mrld4o03nacf	\N	f	38	2026-07-15 00:49:59.684297+00
75	157	lfg_response	rsp mrldjctqay5f wants to squad up for E2E Game mrldjctq12lo	\N	f	48	2026-07-15 01:01:12.354372+00
135	230	lfg_response	rsp mrldyka3k1bv wants to squad up for E2E Game mrldyka3ke35	\N	f	89	2026-07-15 01:13:10.163847+00
198	308	lfg_response	rsp mrm0yotcz8el wants to squad up for E2E Game mrm0yotaszwa	\N	f	128	2026-07-15 11:57:00.599041+00
321	24	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
322	30	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
323	17	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
324	23	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
325	1	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
326	25	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
327	26	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
328	10	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
329	11	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
330	12	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
90	165	lfg_response	rsp mrldkyje9o7p wants to squad up for E2E Game mrldkyjdomiv	\N	f	52	2026-07-15 01:02:39.020427+00
331	28	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
332	5	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
333	16	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
334	20	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
335	36	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
336	27	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
337	52	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
338	18	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
339	29	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
219	335	lfg_response	rsp mrmil01jo65u wants to squad up for E2E Game mrmil01j6qfw	\N	f	141	2026-07-15 20:10:13.330359+00
340	35	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
341	19	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
342	37	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
343	21	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
344	22	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
345	39	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
346	34	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
347	2	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
348	4	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
349	3	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
350	38	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
351	41	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
352	45	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
353	40	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
354	57	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
355	56	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
356	127	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
357	128	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
358	129	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
359	130	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
360	131	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
361	132	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
362	133	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
363	134	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
364	135	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
365	215	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
366	217	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
367	219	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
368	222	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
369	238	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
370	239	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
371	240	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
372	242	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
373	244	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
374	245	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
375	360	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
376	361	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
377	359	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
378	362	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
379	363	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
380	264	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
381	266	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
382	269	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
383	364	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
384	365	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
385	288	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
386	290	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
387	292	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
388	293	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
389	308	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
390	312	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
391	313	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
392	314	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
393	315	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
394	316	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
395	317	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
396	337	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
397	338	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
398	335	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
399	336	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
400	339	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
401	340	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
402	341	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
403	136	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
404	216	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
405	218	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
406	220	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
407	140	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
408	221	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
409	223	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
410	230	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
411	237	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
412	241	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
413	181	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
414	243	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
415	150	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
416	151	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
417	152	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
418	153	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
419	154	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
420	155	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
421	156	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
422	157	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
423	158	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
424	159	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
425	160	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
426	161	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
427	165	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
428	267	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
429	268	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
430	263	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
431	265	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
432	178	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
433	179	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
434	180	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
435	287	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
436	289	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
437	291	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
438	212	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
439	213	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
440	214	announcement	بببب	لللللل	f	\N	2026-07-16 01:03:53.796337+00
441	6	announcement	بببب	لللللل	t	\N	2026-07-16 01:03:53.796337+00
462	457	lfg_response	rsp mrmvg5wb3dpw wants to squad up for E2E Game mrmvg5wbv8im	\N	f	199	2026-07-16 02:10:22.634499+00
483	481	lfg_response	rsp mrnny2cwbpya wants to squad up for E2E Game mrnny2cwec2g	\N	f	212	2026-07-16 15:28:07.01602+00
\.


--
-- Data for Name: owner_activity_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.owner_activity_log (id, action, target_id, target_name, detail, owner_id, owner_name, created_at) FROM stdin;
1	broadcast	\N	\N	"بببب" → 121 users	1	owner_MGX3KB	2026-07-16 01:03:53.830837+00
\.


--
-- Data for Name: parties; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.parties (id, name, game, platform, description, leader_id, max_size, is_public, conversation_id, created_at) FROM stdin;
1	Valorant Ranked Run	Valorant	PC	Looking for 2 more. Diamond+ only.	1	5	t	1	2026-07-13 20:42:37.866552+00
3	SigTest Party 1783986303952_445191	\N	\N	\N	10	5	f	\N	2026-07-13 23:45:04.021959+00
40	SigTest Party 1784077986669_397586	\N	\N	\N	238	5	f	\N	2026-07-15 01:13:07.341616+00
28	SigTest Party 1784076595187_731089	\N	\N	\N	150	5	f	\N	2026-07-15 00:49:55.605903+00
\.


--
-- Data for Name: party_activity; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.party_activity (id, party_id, actor_id, action, created_at) FROM stdin;
1	1	1	created	2026-07-13 20:42:37.873889+00
2	1	2	joined	2026-07-13 20:42:37.873889+00
3	1	3	joined	2026-07-13 20:42:37.873889+00
4	1	6	joined	2026-07-13 22:16:36.747127+00
5	1	6	left	2026-07-13 22:18:10.616941+00
6	1	6	joined	2026-07-13 22:25:41.408862+00
9	1	1	invited	2026-07-14 00:01:34.841865+00
10	1	1	invited	2026-07-14 00:05:34.199651+00
11	1	6	left	2026-07-14 00:06:46.405089+00
12	1	6	joined	2026-07-14 00:06:52.673506+00
13	1	6	left	2026-07-14 00:07:15.434202+00
17	1	6	joined	2026-07-14 01:47:04.312637+00
18	1	57	joined	2026-07-14 23:27:06.760618+00
19	1	57	left	2026-07-14 23:27:33.945976+00
20	1	57	joined	2026-07-14 23:29:37.456116+00
21	1	57	left	2026-07-14 23:29:40.615193+00
188	1	6	left	2026-07-15 02:49:54.69313+00
190	1	6	joined	2026-07-15 02:53:30.506114+00
425	1	6	left	2026-07-16 01:06:33.738468+00
426	1	6	joined	2026-07-16 01:06:36.536143+00
427	1	6	left	2026-07-16 01:15:32.572574+00
428	1	6	joined	2026-07-16 01:15:36.798322+00
429	1	6	left	2026-07-16 01:15:43.623444+00
430	1	6	joined	2026-07-16 01:16:10.281871+00
431	1	6	left	2026-07-16 01:30:45.199053+00
458	1	6	joined	2026-07-16 03:54:50.877548+00
459	1	6	left	2026-07-16 03:54:59.622832+00
460	1	6	joined	2026-07-16 04:37:50.88723+00
461	1	6	left	2026-07-16 04:39:16.76284+00
462	1	6	joined	2026-07-16 04:39:33.202473+00
463	1	6	left	2026-07-16 04:39:37.788651+00
464	1	6	joined	2026-07-16 04:39:42.611911+00
465	1	6	left	2026-07-16 04:39:56.782349+00
467	1	6	joined	2026-07-16 04:53:18.75035+00
468	1	6	left	2026-07-16 04:53:28.122924+00
\.


--
-- Data for Name: party_invites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.party_invites (id, party_id, invited_user_id, invited_by_user_id, status, created_at) FROM stdin;
1	1	3	1	pending	2026-07-14 00:01:34.831176+00
2	1	4	1	pending	2026-07-14 00:05:34.183251+00
\.


--
-- Data for Name: party_members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.party_members (id, party_id, user_id, joined_at) FROM stdin;
1	1	1	2026-07-13 20:42:37.870876+00
2	1	2	2026-07-13 20:42:37.870876+00
3	1	3	2026-07-13 20:42:37.870876+00
8	3	10	2026-07-13 23:45:04.027141+00
9	3	11	2026-07-13 23:45:04.027141+00
123	28	150	2026-07-15 00:49:55.609856+00
124	28	151	2026-07-15 00:49:55.609856+00
187	40	238	2026-07-15 01:13:07.346579+00
188	40	239	2026-07-15 01:13:07.346579+00
\.


--
-- Data for Name: platform_links; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_links (id, user_id, platform, profile_url, username, linked_at) FROM stdin;
1	1	steam	https://steamcommunity.com/id/ghost_x	ghost_x	2026-07-13 20:42:37.851255+00
2	1	xbox	https://www.xbox.com/play/user/ghost_x	ghost_x	2026-07-13 20:42:37.851255+00
3	2	steam	https://steamcommunity.com/id/nova_fx	nova_fx	2026-07-13 20:42:37.851255+00
4	2	playstation	https://psnprofiles.com/nova_fx	nova_fx	2026-07-13 20:42:37.851255+00
5	3	battlenet	https://www.battlenet.com/blade99	blade99#1234	2026-07-13 20:42:37.851255+00
6	4	epic	https://www.epicgames.com/id/viper_z	viper_z	2026-07-13 20:42:37.851255+00
\.


--
-- Data for Name: pro_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pro_subscriptions (id, user_id, order_id, provider, status, amount, currency, started_at, expires_at, metadata, created_at, updated_at) FROM stdin;
1	6	manual-1784162155307	owner	active	\N	\N	2026-07-16 00:35:55.307+00	2026-08-15 00:35:55.307+00	\N	2026-07-16 00:35:55.308517+00	2026-07-16 00:35:55.308517+00
\.


--
-- Data for Name: profile_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profile_comments (id, profile_user_id, author_id, body, created_at) FROM stdin;
2	20	20	my own wall	2026-07-14 02:19:57.599124+00
3	25	26	smoke wall entry	2026-07-14 02:34:08.792212+00
4	25	26	should fail	2026-07-14 02:34:08.815376+00
5	27	28	wall re-enabled	2026-07-14 02:35:04.849094+00
6	6	6	ujihihui	2026-07-14 02:36:24.738766+00
7	6	6	kjlllklk	2026-07-14 02:37:05.996019+00
9	1	6	hi	2026-07-14 02:42:46.526459+00
10	6	6	$$_____$$$__$$_____$$__$$_____$$\n$$$$__$$$$__$$_____$$__$$_____$$\n$$_ $$$_ $$__$$_____$$___$$ ___$$\n$$______$$__$$_____$$______$$\n$$______$$__$$_____$$______$$\n$$______$$__$$_____$$______$$\n$$______$$__$$_____$$______$$\n$$______$$___$$$$$$$_______$$\n\n_________________$$\n$$______$$____$$$$$$$$\n$$$_____$$___$___$$\n$$$$$___$$__$$___$$\n$$__$$__$$__$$___$$\n$$___$$_$$___$$$$$$$$$\n$$____$$$$_______$$___$$\n$$_____$$$_______$$___$$\n$$______$$_______$$___$\n$$______$$___$$$$$$$$\n_________________$$	2026-07-15 00:13:30.188456+00
\.


--
-- Data for Name: profile_photos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profile_photos (id, user_id, object_path, caption, created_at) FROM stdin;
3	30	/objects/uploads/6834dc3c-0bad-47fa-ad44-dd3b652b6e1f	\N	2026-07-14 02:38:41.137004+00
5	34	/objects/uploads/df1da48f-b82c-4779-85c9-b321095d67f7	\N	2026-07-14 02:55:14.031891+00
\.


--
-- Data for Name: super_admins; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.super_admins (id, username, password_hash, email, email_verified, password_reset_code_hash, password_reset_expires_at, password_reset_attempts, created_at, updated_at) FROM stdin;
1	owner_MGX3KB	$2b$10$tsq7IXEomZ6LbqCWjrTHU.HYDWp1ewtfinkH6l7951STAZIfm5IV6	naif5007718@gmail.com	f	\N	\N	0	2026-07-15 23:41:16.672332+00	2026-07-16 00:15:52.843+00
\.


--
-- Data for Name: user_games; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_games (id, user_id, game_id, added_at) FROM stdin;
1	1	1	2026-07-13 20:42:37.845443+00
2	1	3	2026-07-13 20:42:37.845443+00
3	1	7	2026-07-13 20:42:37.845443+00
4	2	2	2026-07-13 20:42:37.845443+00
5	2	10	2026-07-13 20:42:37.845443+00
6	2	1	2026-07-13 20:42:37.845443+00
7	3	3	2026-07-13 20:42:37.845443+00
8	3	5	2026-07-13 20:42:37.845443+00
9	3	7	2026-07-13 20:42:37.845443+00
10	4	4	2026-07-13 20:42:37.845443+00
11	4	1	2026-07-13 20:42:37.845443+00
12	5	6	2026-07-13 20:42:37.845443+00
13	5	8	2026-07-13 20:42:37.845443+00
14	5	9	2026-07-13 20:42:37.845443+00
15	6	7	2026-07-13 22:32:05.638639+00
16	6	10	2026-07-13 22:32:07.959347+00
17	6	5	2026-07-13 22:32:09.338031+00
18	6	4	2026-07-13 22:32:10.664064+00
19	6	8	2026-07-13 22:32:11.358564+00
20	6	1	2026-07-13 22:32:12.658283+00
21	6	6	2026-07-13 22:32:13.51816+00
22	6	3	2026-07-13 22:32:24.538397+00
23	6	9	2026-07-13 22:32:25.397976+00
24	6	2	2026-07-13 22:32:26.08323+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, password_hash, display_name, avatar_url, bio, status, current_game, created_at, updated_at, last_active_at, banner_url, email, email_verified, two_factor_method, totp_secret, allow_profile_comments, rank, is_pro, pro_activated_at, pro_expires_at, pro_order_id, pro_provider, is_admin) FROM stdin;
24	emailer5_44508	$2b$10$1Ah66FZutDNTl7oioZano.h/EDW8gDMmmCcxpjHluIxeckPYYMH.W	Mail Five	\N	\N	online	\N	2026-07-14 02:22:25.526437+00	2026-07-14 02:22:25.526437+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
30	gwh_t_wu2lah	$2b$10$GPFtJYzlv345ter3VStz2ekCnBWUGiFE9.KSJ58T5cwcPNEkkZYqC	E2E Tester	\N	\N	online	\N	2026-07-14 02:37:11.732532+00	2026-07-14 02:39:34.985+00	\N	\N	gwh_t_wu2lah@e2e.test	f	none	72HVYFCSOHRMBZSG4L2P4I6OLS3CH3NC	t	\N	f	\N	\N	\N	salla	f
17	hbedge_14356	$2b$10$tpRZgozCwHF6oRVUc5jI.O6GgTFIoAGKTyV0EZyVVbCsmhid.abSW	Edge	\N	\N	online	\N	2026-07-14 01:50:13.147253+00	2026-07-14 01:54:59.523+00	2026-07-14 01:50:13.336+00	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
23	emailer4_44508	$2b$10$HJVoSQK9Q57maFz22NwoGeZr0tU1MusEcNE2I6lqWN4uW8gdt9VLW	Mail Four	\N	\N	online	\N	2026-07-14 02:22:24.622618+00	2026-07-14 02:22:29.259+00	\N	\N	emailer4_44508@example.com	t	none	\N	t	\N	f	\N	\N	\N	salla	f
1	ghost_x	$2b$10$ZuOCLYZXjooC7blRQZwD9ewWEV1.H259X6FQKyIrcqRoH10NAhIVK	Ghost	\N	Top fragger, mid or feed.	online	\N	2026-07-13 20:42:37.806795+00	2026-07-14 01:29:07.122+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
25	smk_a_mrk1f9ht	$2b$10$iJ0WEvfOuKvGxlQr82T85uTxAInKy./zR/ONadMvXMgGZ1NCxRRF6	Smoke A	\N	\N	online	\N	2026-07-14 02:34:08.588067+00	2026-07-14 02:34:08.588067+00	\N	\N	smk_a_mrk1f9ht@test.dev	f	none	\N	t	\N	f	\N	\N	\N	salla	f
26	smk_b_mrk1f9ht	$2b$10$QwPrRg86u7HAO24bE.KHKOYayJrdZe9gXfoIkEs3BP9J413Ee9.F6	Smoke B	\N	\N	online	\N	2026-07-14 02:34:08.764813+00	2026-07-14 02:34:08.764813+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
10	sigtest_a_1783986303952_445191	x	SigTest a	\N	\N	online	\N	2026-07-13 23:45:04.000696+00	2026-07-13 23:45:04.000696+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
11	sigtest_b_1783986303952_445191	x	SigTest b	\N	\N	online	\N	2026-07-13 23:45:04.000696+00	2026-07-13 23:45:04.000696+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
12	sigtest_c_1783986303952_445191	x	SigTest c	\N	\N	online	\N	2026-07-13 23:45:04.000696+00	2026-07-13 23:45:04.000696+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
28	smk2b_mrk1genh	$2b$10$59uRj16Oydi1TUo.EVEBXuo.0J89U0rH9CHEWp./uKlaXazpvczFa	Smoke B	\N	\N	online	\N	2026-07-14 02:35:02.017643+00	2026-07-14 02:35:02.017643+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
5	storm_r	$2b$10$ZuOCLYZXjooC7blRQZwD9ewWEV1.H259X6FQKyIrcqRoH10NAhIVK	Storm	\N	Casual weekends.	online	\N	2026-07-13 20:42:37.806795+00	2026-07-13 23:58:15.299+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
16	hbtest_12422	$2b$10$NjXpmO1kCjQ0iXq1YS/kmepOixQIyGW7tbUCTVsMFvFq56EVaIvvS	HB Test	\N	\N	offline	\N	2026-07-14 01:42:32.862898+00	2026-07-14 01:42:32.979+00	2026-07-14 01:42:32.966+00	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
20	sectest3_97116	$2b$10$8lQDWDPUU.KM01KwyoOdO.ExXbMWDhKIT6jYqgsGcddklf5KvU7ve	Sec Three	\N	\N	online	\N	2026-07-14 02:19:57.531113+00	2026-07-14 02:19:57.531113+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
36	dbgmrk276l5	$2b$10$R65BbWgE/cNSWjiYUEzx1edEUzL00yOfKcgWWF9RlYfQ5a5ORIT5O	Dbg	\N	\N	online	\N	2026-07-14 02:55:51.197701+00	2026-07-14 02:55:51.575+00	\N	\N	dbgmrk276l5@test.dev	t	email	\N	t	\N	f	\N	\N	\N	salla	f
27	smk2a_mrk1genh	$2b$10$n8COB5lJR9AJBgnAVH.zje20dcAP4ufqMvSAiagr1m7HNID28A.5S	Smoke A	/objects/uploads/fake-smoke-object	\N	online	\N	2026-07-14 02:35:01.911296+00	2026-07-14 02:35:04.866+00	\N	\N	\N	f	none	O6IGEK4K5LW4IHEVJ6MXAITH2WEBEMDH	t	\N	f	\N	\N	\N	salla	f
52	i18nONNavf	$2b$10$izOGi.kVc.RyIKMrpvcrw.0gjVierx0m1f10RgLQm6dQtEW4BAg1W	I18N Tester	\N	\N	online	\N	2026-07-14 19:45:18.677855+00	2026-07-14 19:45:18.677855+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
18	sectest1_97116	$2b$10$9sHpGlf/X0BlEgrJcsDUuuv/ZlTbCgIeudD255237Rdd9XLog/vNe	Sec One	/objects/uploads/45ab73ba-686c-4d07-8cfc-3c8007b8181f	\N	online	\N	2026-07-14 02:19:57.266018+00	2026-07-14 02:20:08.575+00	\N	https://example.com/banner.jpg	sectest1_97116@example.com	f	none	\N	t	\N	f	\N	\N	\N	salla	f
29	smk3_mrk1gxtp	$2b$10$.ryyasuaF3Rk2wj5RhWpVO3Nx9lwUaotsZ4eK2nXBVrCy0R9J3NAy	S3	\N	\N	online	\N	2026-07-14 02:35:26.767603+00	2026-07-14 02:35:26.767603+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
35	sec_b_mrk268wt	$2b$10$tWlX1F4LW1WKQeQ2oizvQ.oJ//pRnQ5gkYROg3OroREXZloFu2Otm	Sec B	\N	\N	online	\N	2026-07-14 02:55:07.763824+00	2026-07-14 02:55:07.763824+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
19	sectest2_97116	$2b$10$D.qk/fc2B6RqIuQhku1cuek0yVCy8RDxVhjCwDtSDn7lioEMICOEe	Sec Two	\N	\N	online	\N	2026-07-14 02:19:57.45447+00	2026-07-14 02:20:08.831+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
37	dbgmrk276l5b	$2b$10$B.u2FNIrn9vl/uTbX8YP3Onk9S8gOVqMQSpnIxjeIjnrvziTS.5qK	DbgB	\N	\N	online	\N	2026-07-14 02:55:51.648001+00	2026-07-14 02:55:51.648001+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
21	emailer4_29321	$2b$10$xwFpbz08eSKLJbjPDkO9ReEmAG9DgE.B0K2H9822rEijRXTaSlv5i	Mail Four	\N	\N	online	\N	2026-07-14 02:22:09.443384+00	2026-07-14 02:22:10.287+00	\N	\N	emailer4_29321@example.com	t	none	\N	t	\N	f	\N	\N	\N	salla	f
22	emailer5_29321	$2b$10$WDc0Py7V5aVFliETW.MXwud1tGMO7CKheBzzPmTdQRBZdL7wbti6e	Mail Five	\N	\N	online	\N	2026-07-14 02:22:10.363141+00	2026-07-14 02:22:10.363141+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
39	v2mrk27t9pb	$2b$10$DBxeNoKqq1DlePXDzWVO5OnsksqljUznPyeYj.SI1SOC2WQJa2kPi	Sec B	\N	\N	online	\N	2026-07-14 02:56:20.729216+00	2026-07-14 02:56:20.729216+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
34	sec_a_mrk268wt	$2b$10$AjVI3qF.SM6IZSEWKSAHK.KSEQquDMou0uWqgdlL5yu07wcsw3B4m	Sec A	/objects/uploads/df1da48f-b82c-4779-85c9-b321095d67f7	\N	online	\N	2026-07-14 02:55:07.54743+00	2026-07-14 02:55:23.563+00	\N	\N	sec_a_mrk268wt@test.dev	t	none	\N	t	\N	f	\N	\N	\N	salla	f
2	nova_fx	$2b$10$ZuOCLYZXjooC7blRQZwD9ewWEV1.H259X6FQKyIrcqRoH10NAhIVK	Nova	\N	Souls vet. PvP specialist.	online	\N	2026-07-13 20:42:37.806795+00	2026-07-14 01:50:59.523+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
4	viper_z	$2b$10$ZuOCLYZXjooC7blRQZwD9ewWEV1.H259X6FQKyIrcqRoH10NAhIVK	Viper	\N	Diamond support main.	online	\N	2026-07-13 20:42:37.806795+00	2026-07-14 01:50:59.523+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
3	blade99	$2b$10$ZuOCLYZXjooC7blRQZwD9ewWEV1.H259X6FQKyIrcqRoH10NAhIVK	Blade	\N	Grinder. Always ready to party.	online	\N	2026-07-13 20:42:37.806795+00	2026-07-14 01:50:59.523+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
38	v2mrk27t9p	$2b$10$qjxka7jbGEcTicmEc6ns5eM/AudYWEgTaA/33vfYIIuRzS77/zGkS	Sec A	/objects/uploads/2862d9af-0959-4a3f-9feb-14f3b359aa41	\N	online	\N	2026-07-14 02:56:20.571746+00	2026-07-14 02:56:24.426+00	\N	\N	v2mrk27t9p@test.dev	t	email	\N	t	\N	f	\N	\N	\N	salla	f
41	v3mrk28p73b	$2b$10$u8pe0t15JD3bccdONAlGP.13A9Xu8.XPhv79d2zLG.ZSX3wAgacbu	Sec B	\N	\N	online	\N	2026-07-14 02:57:02.113695+00	2026-07-14 02:57:02.113695+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
45	rs26259	$2b$10$2wG9ZIze7iPWfmwuaqo4xOYjdcc3G0yujLI8jwCxpnCOlk.hnAmHi	RS	\N	\N	online	\N	2026-07-14 10:50:59.260712+00	2026-07-14 10:50:59.260712+00	\N	\N	rs26259@test.dev	f	none	\N	t	\N	f	\N	\N	\N	salla	f
40	v3mrk28p73	$2b$10$bvBZlS4saHicT8JHra3PU.u9qxyRRYwDbooC83UjX9AAMswNHVSIu	Sec A	/objects/uploads/2c35cba6-0bf4-4b9a-9f50-24efe6b5af2d	\N	online	\N	2026-07-14 02:57:01.950639+00	2026-07-14 02:57:07.002+00	\N	\N	v3mrk28p73@test.dev	t	email	\N	t	\N	f	\N	\N	\N	salla	f
57	ibr	$2b$10$w3oGQkO1mUVJo395AP.IAuAum5T1kwCOZy/YqDRaMy43kp1uom06i	ibr	\N	\N	online	\N	2026-07-14 23:26:24.28581+00	2026-07-14 23:47:32.509+00	\N	\N	ibrahimsa2612@gmail.com	f	none	\N	t	\N	f	\N	\N	\N	salla	f
56	reqmail_21374d	$2b$10$MDVwLA/6Njk/O6jd.YoQK.OSMA6i9HFfLgCVzrTqfGw8eBIzzS5O6	T	\N	\N	online	\N	2026-07-14 20:43:29.541878+00	2026-07-14 20:43:29.541878+00	\N	\N	reqmail_21374d@example.com	f	none	\N	t	\N	f	\N	\N	\N	salla	f
127	autmrld0v88npkj	$2b$10$wkceyS.bUsqvEIM6Gr9g2OK7aGW1AFOMSG5tfpK43qvG56/zhCLX6	aut mrld0v88npkj	\N	\N	online	\N	2026-07-15 00:46:42.594926+00	2026-07-15 00:46:42.594926+00	\N	\N	autmrld0v88npkj@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
128	rspmrld0v88n1q7	$2b$10$PE4JMhavjdfcDJkJZwExu.tGbnF5NOS2usV36vivbgIs3FbZXe3XC	rsp mrld0v88n1q7	\N	\N	online	\N	2026-07-15 00:46:47.81395+00	2026-07-15 00:46:47.81395+00	\N	\N	rspmrld0v88n1q7@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
129	autmrld15vhevo2	$2b$10$6PzMEh6XVLhBhDmAwchuKeGUxBbINVsXZBs7p1uvNB5Iy2V8hQoPe	aut mrld15vhevo2	\N	\N	online	\N	2026-07-15 00:46:53.878978+00	2026-07-15 00:46:53.878978+00	\N	\N	autmrld15vhevo2@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
130	rspmrld15vhaf5x	$2b$10$xFA5scAm5tKrS147Ryfv.OWfiYYo34XughIOsKwBcjyjIUiPQrugG	rsp mrld15vhaf5x	\N	\N	online	\N	2026-07-15 00:46:58.941433+00	2026-07-15 00:46:58.941433+00	\N	\N	rspmrld15vhaf5x@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
131	fltmrld1focw412	$2b$10$z1X6/sYy9S7FsuDAPNG0sekhqpOxBcQw79r7n4oQFpzY4M.slwVL2	flt mrld1focw412	\N	\N	online	\N	2026-07-15 00:47:07.073864+00	2026-07-15 00:47:07.073864+00	\N	\N	fltmrld1focw412@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
132	autmrld2ilkvqj3	$2b$10$iZqjuVk8yT/QwIBgTa7Fd.KlOowzLWgPLf/jR4KI2gvTkgCTmD6xq	aut mrld2ilkvqj3	\N	\N	online	\N	2026-07-15 00:47:57.695931+00	2026-07-15 00:47:57.695931+00	\N	\N	autmrld2ilkvqj3@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
133	rspmrld2ilkm2k0	$2b$10$swO5yo9pJcXlvVJ59j7Cb.yhkHr9YTRmbaFZpf/vpkhaH1MXjnjnq	rsp mrld2ilkm2k0	\N	\N	online	\N	2026-07-15 00:48:02.622974+00	2026-07-15 00:48:02.622974+00	\N	\N	rspmrld2ilkm2k0@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
134	autmrld2sa6ctpx	$2b$10$g3aMmaYrRPtftUMvFY6Vw.2wvqIRy6eOBC9LB8LKAPSByYU80Nhy.	aut mrld2sa6ctpx	\N	\N	online	\N	2026-07-15 00:48:09.872447+00	2026-07-15 00:48:09.872447+00	\N	\N	autmrld2sa6ctpx@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
135	rspmrld2sa6d613	$2b$10$4n8KlF8VPmNYZmnRQwxld.MGMSaWJ.uFuNMCXQjbi802zr/znuHBm	rsp mrld2sa6d613	\N	\N	online	\N	2026-07-15 00:48:15.531829+00	2026-07-15 00:48:15.531829+00	\N	\N	rspmrld2sa6d613@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
215	rspmrldr25882w6	$2b$10$5MqLUqF6rGUFbsXp4v4esuRzTN5DLKQ4JqDLPDCENRIZ1KZyyvxd.	rsp mrldr25882w6	\N	\N	online	\N	2026-07-15 01:07:08.085775+00	2026-07-15 01:07:08.085775+00	\N	\N	rspmrldr25882w6@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
217	autmrldw0bcd90x	$2b$10$7NQKs7bPHIxf65HNp1lb4OLfKqIv88NfaXeercbd/SVnkR4fwXzz6	aut mrldw0bcd90x	\N	\N	online	\N	2026-07-15 01:10:53.718706+00	2026-07-15 01:10:53.718706+00	\N	\N	autmrldw0bcd90x@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
219	autmrldwaoke7gl	$2b$10$jVT.Qd/JaJj6jLGZPgzgV.kcTlahc1cZq4.83XtXgM0tZWGsbCeNi	aut mrldwaoke7gl	\N	\N	online	\N	2026-07-15 01:11:06.509285+00	2026-07-15 01:11:06.509285+00	\N	\N	autmrldwaoke7gl@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
222	viewmrldwlm0wyf7	$2b$10$18H8PElnaKWW.w6uvtay.OoBgejPF6QAGkEkPUovydvMBmn8HGGe6	view mrldwlm0wyf7	\N	\N	online	\N	2026-07-15 01:11:26.714761+00	2026-07-15 01:11:26.714761+00	\N	\N	viewmrldwlm0wyf7@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
238	sigtest_a_1784077986669_397586	x	SigTest a	\N	\N	online	\N	2026-07-15 01:13:07.33306+00	2026-07-15 01:13:07.33306+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
239	sigtest_b_1784077986669_397586	x	SigTest b	\N	\N	online	\N	2026-07-15 01:13:07.33306+00	2026-07-15 01:13:07.33306+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
240	sigtest_c_1784077986669_397586	x	SigTest c	\N	\N	online	\N	2026-07-15 01:13:07.33306+00	2026-07-15 01:13:07.33306+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
242	rspmrldz329096t	$2b$10$JZ/uhf9Pj0kaKLbsv8j5UOd4DCVqMg6qdfJHIkBEMuCrkLbT1T/Qa	rsp mrldz329096t	\N	\N	online	\N	2026-07-15 01:13:22.378564+00	2026-07-15 01:13:22.378564+00	\N	\N	rspmrldz329096t@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
244	viewmrldzdcuz7an	$2b$10$iVbxGXPoFnGnhjg43b4MEuraY8AJ7Q56jPYkP78Y7WbpBickjQL9q	view mrldzdcuz7an	\N	\N	online	\N	2026-07-15 01:13:35.54012+00	2026-07-15 01:13:35.54012+00	\N	\N	viewmrldzdcuz7an@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
245	fltmrldzmi1lj85	$2b$10$wmxni2Xa4uNIvHU1WiMZfOneYIXzcAGpFZAwR5ZnoTzI2.vMe6n0a	flt mrldzmi1lj85	\N	\N	online	\N	2026-07-15 01:13:41.794631+00	2026-07-15 01:13:41.794631+00	\N	\N	fltmrldzmi1lj85@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
360	rspmrmn3nafbbjy	$2b$10$AEwfb5sEwrxUnXNxMWxlNur4BF5X025RV1Meseo3d85Ifa5miCs3y	rsp mrmn3nafbbjy	\N	\N	online	\N	2026-07-15 22:16:41.272375+00	2026-07-15 22:16:41.272375+00	\N	\N	rspmrmn3nafbbjy@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
361	autmrmn3yyd4frk	$2b$10$ZOf4F4i.sjslNgBv2.OPy..M/LbCT0VYxY7vKUDed8X9kR7SJf.Dq	aut mrmn3yyd4frk	\N	\N	online	\N	2026-07-15 22:16:47.121519+00	2026-07-15 22:16:47.121519+00	\N	\N	autmrmn3yyd4frk@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
359	autmrmn3nafgq9c	$2b$10$wMD.oQ.vGPSWrx97KlxBge1C386HruGpOrcmY8wi9hkHCDYXWFuca	aut mrmn3nafgq9c	\N	\N	online	\N	2026-07-15 22:16:35.95188+00	2026-07-15 22:16:35.95188+00	\N	\N	autmrmn3nafgq9c@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
362	rspmrmn3yydvsat	$2b$10$Db5ESZpWPcFoeD6ZhUFStO2pXcK2JKVhKTZ0wM45Vo8iEhER6i15y	rsp mrmn3yydvsat	\N	\N	online	\N	2026-07-15 22:16:51.612213+00	2026-07-15 22:16:51.612213+00	\N	\N	rspmrmn3yydvsat@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
363	delmrmn477iv8db	$2b$10$ZMkQYr/K/MBvKyIDaPwtGuf194Dy9Uob.mR.leGXRGWVBbWAg4aB2	del mrmn477iv8db	\N	\N	online	\N	2026-07-15 22:16:58.121116+00	2026-07-15 22:16:58.121116+00	\N	\N	delmrmn477iv8db@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
264	rspmrlj9r7w6mv1	$2b$10$UUztOW89oX4mf45YZs5eAeMxVR.7dQFlL2JkAmoMpLkvFwAQS0Ktu	rsp mrlj9r7w6mv1	\N	\N	online	\N	2026-07-15 03:41:44.684649+00	2026-07-15 03:41:44.684649+00	\N	\N	rspmrlj9r7w6mv1@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
266	rspmrlja6sx13qh	$2b$10$7ndMPZbwd3XVhOVZdjsv5OIaafjXszSMSjXYb3tJIbo6EPkwqsPUW	rsp mrlja6sx13qh	\N	\N	online	\N	2026-07-15 03:41:59.359372+00	2026-07-15 03:41:59.359372+00	\N	\N	rspmrlja6sx13qh@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
269	fltmrljapkfwsld	$2b$10$zokf6vhe2Z2DWweLAqkE3uz/hvhunI13kcpb3xJm7jraJilPPueQ6	flt mrljapkfwsld	\N	\N	online	\N	2026-07-15 03:42:17.041725+00	2026-07-15 03:42:17.041725+00	\N	\N	fltmrljapkfwsld@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
364	viewmrmn477ilv6c	$2b$10$gaBwJFsIR8E54NGgI7PRH.hnE6g/PlufccPmORxA3yk/dGrJdIghG	view mrmn477ilv6c	\N	\N	online	\N	2026-07-15 22:17:02.755865+00	2026-07-15 22:17:02.755865+00	\N	\N	viewmrmn477ilv6c@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
365	fltmrmn4f1ljlmm	$2b$10$KN/k5oK5dTrxHq75Fy/lzeLoYsMV.WJnDIlEKVY0aRNT4OY.7C.dC	flt mrmn4f1ljlmm	\N	\N	online	\N	2026-07-15 22:17:08.062329+00	2026-07-15 22:17:08.062329+00	\N	\N	fltmrmn4f1ljlmm@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
288	rspmrlo3rse6kf0	$2b$10$VWs3ryK5tFq2tz5zrLxUge.uU7cfxU9yOoG2c/QFQ.sHo2J2Zd6zK	rsp mrlo3rse6kf0	\N	\N	online	\N	2026-07-15 05:56:58.482631+00	2026-07-15 05:56:58.482631+00	\N	\N	rspmrlo3rse6kf0@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
290	rspmrlo42y0se2r	$2b$10$vKV.tbJh7iNP4sX6TuxJcOUswfe7SbcufHB3XBXwykbhexbn2LaAi	rsp mrlo42y0se2r	\N	\N	online	\N	2026-07-15 05:57:10.025437+00	2026-07-15 05:57:10.025437+00	\N	\N	rspmrlo42y0se2r@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
292	viewmrlo4axuneos	$2b$10$oKxTRNgIX6n5wTfVOY2/M.fvPLcvSh.BW65Dn0mVLc.dHxnQkf/pq	view mrlo4axuneos	\N	\N	online	\N	2026-07-15 05:57:20.182535+00	2026-07-15 05:57:20.182535+00	\N	\N	viewmrlo4axuneos@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
293	fltmrlo4hmio700	$2b$10$6T/ohy0WGifwX9pOtHd.nuaFc5nLh83xN9yi5m66LhoXOWLKalYeu	flt mrlo4hmio700	\N	\N	online	\N	2026-07-15 05:57:24.860404+00	2026-07-15 05:57:24.860404+00	\N	\N	fltmrlo4hmio700@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
308	autmrm0yotbarkc	$2b$10$nFxj45.Us81YwqVUaXPtLus6O.tBn3Xeffptb1kmJrcewcGSSWZl6	aut mrm0yotbarkc	\N	\N	online	\N	2026-07-15 11:56:53.735717+00	2026-07-15 11:56:53.735717+00	\N	\N	autmrm0yotbarkc@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
312	rspmrm0yotcz8el	$2b$10$K5t6yilljv8/KabVKX1ZPetZ5.KXhoH966/f8timMfFqz7vbua2By	rsp mrm0yotcz8el	\N	\N	online	\N	2026-07-15 11:56:58.74296+00	2026-07-15 11:56:58.74296+00	\N	\N	rspmrm0yotcz8el@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
313	autmrm0z1k5c6cu	$2b$10$P7EF4K9NTHTmjdjI6UXobeOd6TmhPQZyJYUe4ig9lSvPyroR7Iv0a	aut mrm0z1k5c6cu	\N	\N	online	\N	2026-07-15 11:57:05.605753+00	2026-07-15 11:57:05.605753+00	\N	\N	autmrm0z1k5c6cu@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
314	rspmrm0z1k5cvx9	$2b$10$xD7dQoiGexuJdlShXwdKyetYk5f.G25ZBFYKdlugqczCp2uxSRVnq	rsp mrm0z1k5cvx9	\N	\N	online	\N	2026-07-15 11:57:09.386796+00	2026-07-15 11:57:09.386796+00	\N	\N	rspmrm0z1k5cvx9@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
315	delmrm0z8ryb1f6	$2b$10$Tr13BWR3U9uCg1QQVTNpaulaJ78cGWLT.T5MXMTNJuA0cbc4N5GAG	del mrm0z8ryb1f6	\N	\N	online	\N	2026-07-15 11:57:14.985893+00	2026-07-15 11:57:14.985893+00	\N	\N	delmrm0z8ryb1f6@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
316	viewmrm0z8ryp7gp	$2b$10$l8azNsueYLof9MR/q71XWOHaPwPvHi4ldKA.R2LlvYGQIgJsgI.HC	view mrm0z8ryp7gp	\N	\N	online	\N	2026-07-15 11:57:19.095875+00	2026-07-15 11:57:19.095875+00	\N	\N	viewmrm0z8ryp7gp@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
317	fltmrm0zfy8k84m	$2b$10$qGVBaX.1T29H8UvnIMAB.ep/dqyaXGomATaWPolnuU.zBDrW6NrKK	flt mrm0zfy8k84m	\N	\N	online	\N	2026-07-15 11:57:24.424134+00	2026-07-15 11:57:24.424134+00	\N	\N	fltmrm0zfy8k84m@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
337	autmrmilatpsa98	$2b$10$MpEZ1I73ZkDL20WEV7lngeuDoBrzJ.fappb2FRFOEBSib6JLji1Bi	aut mrmilatpsa98	\N	\N	online	\N	2026-07-15 20:10:17.545373+00	2026-07-15 20:10:17.545373+00	\N	\N	autmrmilatpsa98@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
338	rspmrmilatpdofb	$2b$10$R3U8VBWHpXDlAq9WGjwZL.1jTe4uqAqzTKa1qfADudjw70xO6WkjK	rsp mrmilatpdofb	\N	\N	online	\N	2026-07-15 20:10:21.607362+00	2026-07-15 20:10:21.607362+00	\N	\N	rspmrmilatpdofb@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
335	autmrmil01jjre3	$2b$10$a0l6kcSQJ9sZT/8kF8jV/uqMymPTxqK2aafbkljOgwhBRcFx06j.e	aut mrmil01jjre3	\N	\N	online	\N	2026-07-15 20:10:07.220463+00	2026-07-15 20:10:07.220463+00	\N	\N	autmrmil01jjre3@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
336	rspmrmil01jo65u	$2b$10$CX4Y9ukax9AgFh1uDh1q5O9p3aq2nZMPnh27qu7qgJa7k4vaIKkyy	rsp mrmil01jo65u	\N	\N	online	\N	2026-07-15 20:10:11.657857+00	2026-07-15 20:10:11.657857+00	\N	\N	rspmrmil01jo65u@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
339	delmrmiliez5cyp	$2b$10$VnhFx/jUMgYM8AeI5z/0YODmAM51yMQGB/ejebh1V0YRYI.Cxc9A6	del mrmiliez5cyp	\N	\N	online	\N	2026-07-15 20:10:27.294639+00	2026-07-15 20:10:27.294639+00	\N	\N	delmrmiliez5cyp@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
340	viewmrmiliez3jpf	$2b$10$XkCC2dQmdrhiH0BDY17PJ.64Z.KQYcbM/aKNyN9LdbfS8UTgYWgTq	view mrmiliez3jpf	\N	\N	online	\N	2026-07-15 20:10:31.456245+00	2026-07-15 20:10:31.456245+00	\N	\N	viewmrmiliez3jpf@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
341	fltmrmilp9b9p9f	$2b$10$INcE7gzj80AMLyqKMgkApeFrPI.Y3THZiXWV39.6IKWaxQp9RXymW	flt mrmilp9b9p9f	\N	\N	online	\N	2026-07-15 20:10:36.18958+00	2026-07-15 20:10:36.18958+00	\N	\N	fltmrmilp9b9p9f@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
136	fltmrld31pry59e	$2b$10$V/ER0CcfMo3NyZJF0XIKx.nDlhPDK1i1T5m5BaQD7gSUFJxjd5Msi	flt mrld31pry59e	\N	\N	online	\N	2026-07-15 00:48:21.882222+00	2026-07-15 00:48:21.882222+00	\N	\N	fltmrld31pry59e@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
216	fltmrldrccz5tfo	$2b$10$VNDCNcBSm1niF26r5.Yf9eKA.5.yycmFmaCFrbIvkZC6Vp8ygDDX2	flt mrldrccz5tfo	\N	\N	online	\N	2026-07-15 01:07:15.447026+00	2026-07-15 01:07:15.447026+00	\N	\N	fltmrldrccz5tfo@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
218	rspmrldw0bcnzlk	$2b$10$bb.TksVo2wdQvnUhxmDAPOvqW21kiLv7lEIeQiF5bdTKG5b4NbCU.	rsp mrldw0bcnzlk	\N	\N	online	\N	2026-07-15 01:10:59.172506+00	2026-07-15 01:10:59.172506+00	\N	\N	rspmrldw0bcnzlk@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
220	rspmrldwaokldd3	$2b$10$hjz7tYr3TqbkPuldusHoROFHCiTiBJ0s6umdQZ7ELkTm3XQeDCt1e	rsp mrldwaokldd3	\N	\N	online	\N	2026-07-15 01:11:12.552029+00	2026-07-15 01:11:12.552029+00	\N	\N	rspmrldwaokldd3@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
140	autmrld4o03w9xe	$2b$10$SgmeU.6TmzIO7sGb7Kk9A.1pFNzjoUjk6zK7.eE2iKS8elykhZp3m	aut mrld4o03w9xe	\N	\N	online	\N	2026-07-15 00:49:39.184994+00	2026-07-15 00:49:39.184994+00	\N	\N	autmrld4o03w9xe@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
221	delmrldwlm0pxaf	$2b$10$4YhIPz9QqCsgC0Q9zTzj6.IAWhCqF0IgoMSM3a4z7AuCJiKAzb526	del mrldwlm0pxaf	\N	\N	online	\N	2026-07-15 01:11:20.824121+00	2026-07-15 01:11:20.824121+00	\N	\N	delmrldwlm0pxaf@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
223	fltmrldwuk6ypxb	$2b$10$qwbR/0sO69he92In1sb.aexOqmmnqFVT6Y4jMLtJjRg.NecidhNcC	flt mrldwuk6ypxb	\N	\N	online	\N	2026-07-15 01:11:32.245178+00	2026-07-15 01:11:32.245178+00	\N	\N	fltmrldwuk6ypxb@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
230	autmrldyka31wv5	$2b$10$wPs4uT8yUF0Wi5x8yU5CfuaKgg9yIObUZHjf67T.d4hyrXW/Z98jS	aut mrldyka31wv5	\N	\N	online	\N	2026-07-15 01:12:56.277429+00	2026-07-15 01:12:56.277429+00	\N	\N	autmrldyka31wv5@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
237	rspmrldyka3k1bv	$2b$10$hPVjT6F2d0tlvjTsghD.UOtnl01aLCcGw.iZeExbgeuvhwOC5fE1G	rsp mrldyka3k1bv	\N	\N	online	\N	2026-07-15 01:13:04.102857+00	2026-07-15 01:13:04.102857+00	\N	\N	rspmrldyka3k1bv@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
241	autmrldz3294wtg	$2b$10$vuEVDDP01D/O3f73cU5rL.dErxVlHaTtnYGfYbQWU81nK72HyFU1u	aut mrldz3294wtg	\N	\N	online	\N	2026-07-15 01:13:16.691383+00	2026-07-15 01:13:16.691383+00	\N	\N	autmrldz3294wtg@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
181	fltmrldlu82vk9i	$2b$10$mr5e8aWNlkbIdF3FhhzNZekbKGTAQuU1/TC0WIzQim/mD8IbpZUWC	flt mrldlu82vk9i	\N	\N	online	\N	2026-07-15 01:02:58.956109+00	2026-07-15 01:02:58.956109+00	\N	\N	fltmrldlu82vk9i@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
243	delmrldzdcu8jo6	$2b$10$vz0upxRa7fd6.lb.Wvm4Z.kbchl.v117R2caRS4uHZ8QJh8vULaK2	del mrldzdcu8jo6	\N	\N	online	\N	2026-07-15 01:13:30.031948+00	2026-07-15 01:13:30.031948+00	\N	\N	delmrldzdcu8jo6@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
150	sigtest_a_1784076595187_731089	x	SigTest a	\N	\N	online	\N	2026-07-15 00:49:55.597025+00	2026-07-15 00:49:55.597025+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
151	sigtest_b_1784076595187_731089	x	SigTest b	\N	\N	online	\N	2026-07-15 00:49:55.597025+00	2026-07-15 00:49:55.597025+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
152	sigtest_c_1784076595187_731089	x	SigTest c	\N	\N	online	\N	2026-07-15 00:49:55.597025+00	2026-07-15 00:49:55.597025+00	\N	\N	\N	f	none	\N	t	\N	f	\N	\N	\N	salla	f
153	rspmrld4o034p5a	$2b$10$D9CTJAJg8B0PcN6lpsu5NefxAbV4.c7pguFsMP6.PZjvxElw/pp9i	rsp mrld4o034p5a	\N	\N	online	\N	2026-07-15 00:49:57.562982+00	2026-07-15 00:49:57.562982+00	\N	\N	rspmrld4o034p5a@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
154	autmrld5afhzb7v	$2b$10$tEd02VJ4FB7ZDDjaeY9tkeo5.O.mYLOIW12Gr.zm6XBpAD.iR37EC	aut mrld5afhzb7v	\N	\N	online	\N	2026-07-15 00:50:06.667999+00	2026-07-15 00:50:06.667999+00	\N	\N	autmrld5afhzb7v@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
155	rspmrld5afhjjvu	$2b$10$Kj4owu0EpfT387v4QLyqXuhiaDHvicf9WWvZOWwdw3j0lShk9b/eq	rsp mrld5afhjjvu	\N	\N	online	\N	2026-07-15 00:50:12.042699+00	2026-07-15 00:50:12.042699+00	\N	\N	rspmrld5afhjjvu@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
156	fltmrld5krwmssf	$2b$10$v3GRmAIg22H9Q9qVgF02Du.7sLgFVfZh.59NOGvt96AoC0RJLDzPm	flt mrld5krwmssf	\N	\N	online	\N	2026-07-15 00:50:19.956465+00	2026-07-15 00:50:19.956465+00	\N	\N	fltmrld5krwmssf@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
157	autmrldjctqae0a	$2b$10$RUdkkt3mvnljOZhbEDk/D.81g96uh/hu4oRjuGdwauOL/5vYeEimu	aut mrldjctqae0a	\N	\N	online	\N	2026-07-15 01:01:05.155034+00	2026-07-15 01:01:05.155034+00	\N	\N	autmrldjctqae0a@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
158	rspmrldjctqay5f	$2b$10$gDSiFAFOFrbVN41Q6Eg9SefG0Uv1PbiegP2FfUdZqoHO08QKtmRg2	rsp mrldjctqay5f	\N	\N	online	\N	2026-07-15 01:01:10.715265+00	2026-07-15 01:01:10.715265+00	\N	\N	rspmrldjctqay5f@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
159	autmrldjol9qij6	$2b$10$QULovT05qPrNcDOf/Zed9.BzW8LKkibFN0cz9AcDwqxSl2xvuJTzK	aut mrldjol9qij6	\N	\N	online	\N	2026-07-15 01:01:18.313918+00	2026-07-15 01:01:18.313918+00	\N	\N	autmrldjol9qij6@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
160	rspmrldjol9co7z	$2b$10$XHySf8rhbIRSPhuXIfWBaeweJa.4oUkb/KOXKOg/isRPodttCHUJ.	rsp mrldjol9co7z	\N	\N	online	\N	2026-07-15 01:01:23.86517+00	2026-07-15 01:01:23.86517+00	\N	\N	rspmrldjol9co7z@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
161	fltmrldjyw7xkk5	$2b$10$Z55IZ.e/w9Hwq2./9HAx0.ynneBVj3sBP1xmhy5PHRmoXIYsfy.ki	flt mrldjyw7xkk5	\N	\N	online	\N	2026-07-15 01:01:31.585388+00	2026-07-15 01:01:31.585388+00	\N	\N	fltmrldjyw7xkk5@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
165	autmrldkyje64qy	$2b$10$PsLIAJUKflM0O.MzbjNwy.Gk0hxGsBdnLOh/gHPP0AyeArOtK2Xf6	aut mrldkyje64qy	\N	\N	online	\N	2026-07-15 01:02:19.889938+00	2026-07-15 01:02:19.889938+00	\N	\N	autmrldkyje64qy@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
267	delmrljah6ywxer	$2b$10$biCxbTtue72jfsqTUyO/GOccWZGfnt1TbPlNmUiZNyd1b1/kLhwgG	del mrljah6ywxer	\N	\N	online	\N	2026-07-15 03:42:06.268454+00	2026-07-15 03:42:06.268454+00	\N	\N	delmrljah6ywxer@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
268	viewmrljah6ybi46	$2b$10$oUxkOR1v7ik7HY1rNTzZoe/mJ6PPmzUjvgTUGA2Sj9jgnFsZIhSpu	view mrljah6ybi46	\N	\N	online	\N	2026-07-15 03:42:11.062996+00	2026-07-15 03:42:11.062996+00	\N	\N	viewmrljah6ybi46@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
263	autmrlj9r7w7bug	$2b$10$3AH1iiDUjWUlFukTLugbHeONMbE6IvvYV/fMD3Uayt9HvQAIcesQe	aut mrlj9r7w7bug	\N	\N	online	\N	2026-07-15 03:41:38.672117+00	2026-07-15 03:41:38.672117+00	\N	\N	autmrlj9r7w7bug@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
265	autmrlja6sxmbg0	$2b$10$lh9oaSJWgEqfaqC1jMDoLuUjdugu0c/2aoyBbsKRh.rcCUKyAlWtq	aut mrlja6sxmbg0	\N	\N	online	\N	2026-07-15 03:41:53.407716+00	2026-07-15 03:41:53.407716+00	\N	\N	autmrlja6sxmbg0@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
178	rspmrldkyje9o7p	$2b$10$z0V76Ejy643LFPn8Pmz2sO1UGzLb2H8Z/RoKNvafMZlllqe6D2bu2	rsp mrldkyje9o7p	\N	\N	online	\N	2026-07-15 01:02:36.525817+00	2026-07-15 01:02:36.525817+00	\N	\N	rspmrldkyje9o7p@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
179	autmrldlk4hdhv2	$2b$10$ibZ2iogytHOoy.lYeuMmVOdzZc9YogXxbF9AINlUmGQIKhOodmP9m	aut mrldlk4hdhv2	\N	\N	online	\N	2026-07-15 01:02:45.741698+00	2026-07-15 01:02:45.741698+00	\N	\N	autmrldlk4hdhv2@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
180	rspmrldlk4hkqxq	$2b$10$8x1u9Wo612Z2uu32KM9mzeFHVl0wY7U6t2XVwgikudMr7FZQ3GYvW	rsp mrldlk4hkqxq	\N	\N	online	\N	2026-07-15 01:02:51.090973+00	2026-07-15 01:02:51.090973+00	\N	\N	rspmrldlk4hkqxq@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
287	autmrlo3rsei4xt	$2b$10$oxgf2mZGDGIPrNuH4uz7/Oh4GlZyRD0xcmmWBdCPoCzZZEsEyg3uS	aut mrlo3rsei4xt	\N	\N	online	\N	2026-07-15 05:56:54.096969+00	2026-07-15 05:56:54.096969+00	\N	\N	autmrlo3rsei4xt@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
289	autmrlo42y0w2px	$2b$10$UwPQ5r02PBJ8dG1.fFyF/uEzSJAuJkTV.CWbbXWdMteTz1QYxXEHe	aut mrlo42y0w2px	\N	\N	online	\N	2026-07-15 05:57:05.712173+00	2026-07-15 05:57:05.712173+00	\N	\N	autmrlo42y0w2px@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
291	delmrlo4axuaju0	$2b$10$.TedMRXCpZWfdVT0nGvHg.9JGhPPeh82kUNiUwTZCqzjR2moJR8vC	del mrlo4axuaju0	\N	\N	online	\N	2026-07-15 05:57:16.118793+00	2026-07-15 05:57:16.118793+00	\N	\N	delmrlo4axuaju0@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
212	autmrldqn5yonl5	$2b$10$3xj9pBoQ9iq3G3Bjqv7jaevdMyca6Wlg1DaezoMgKPJPWkyCztvcK	aut mrldqn5yonl5	\N	\N	online	\N	2026-07-15 01:06:47.440203+00	2026-07-15 01:06:47.440203+00	\N	\N	autmrldqn5yonl5@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
213	rspmrldqn5yzgfj	$2b$10$IY8T5BBm4oPF1xirF1i/bu9BNQeTsZ..fnlBSOjbRVHn2Um.LktY.	rsp mrldqn5yzgfj	\N	\N	online	\N	2026-07-15 01:06:53.219039+00	2026-07-15 01:06:53.219039+00	\N	\N	rspmrldqn5yzgfj@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
214	autmrldr258u56s	$2b$10$3/YZg31VobWOK6epfqXn0eZ/HmA3pxQC/EuQ9cccT4.FsLtR5JHhq	aut mrldr258u56s	\N	\N	online	\N	2026-07-15 01:07:02.310716+00	2026-07-15 01:07:02.310716+00	\N	\N	autmrldr258u56s@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
6	nnn	$2b$10$7Kk6vBZl7FG3buw4MyUAf.BP0LcZyPLP1.Lsp9HrO65FnIyiQoana	naf	/objects/uploads/e136629f-6284-4c0a-951b-318ba8e72212	fdfggfdgdfgd	online	\N	2026-07-13 20:54:14.290664+00	2026-07-16 03:52:10.1+00	2026-07-14 02:31:45.141+00	/objects/uploads/ad1f25bb-7690-4e95-ab1f-3b44f4b43418	naif50077@gmail.com	f	none	AL62SJON4FNHAY6DE4RC7XZAUFDKIKZL	f	Goled	t	2026-07-16 00:35:55.307+00	2026-08-15 00:35:55.307+00	manual-1784162155307	owner	t
457	autmrmvg5wb6844	$2b$10$GbVcQwP9uSQmFzHoMCEf1eBjf9tsvJiHJCT2USo8fSjkMpEVZ2haq	aut mrmvg5wb6844	\N	\N	online	\N	2026-07-16 02:10:16.233655+00	2026-07-16 02:10:16.233655+00	\N	\N	autmrmvg5wb6844@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
458	rspmrmvg5wb3dpw	$2b$10$nzEgWQcfxOSTv7j.d5hSc.kQW1tmzdrNWKKRPjw7rC.D70zOs2GyG	rsp mrmvg5wb3dpw	\N	\N	online	\N	2026-07-16 02:10:21.120663+00	2026-07-16 02:10:21.120663+00	\N	\N	rspmrmvg5wb3dpw@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
459	autmrmvgh0795lb	$2b$10$9FaOuQkBx7Kwa1l/zyh9WeCYVdiuL24O5taRUJ01rP8P8PmpsFbwa	aut mrmvgh0795lb	\N	\N	online	\N	2026-07-16 02:10:27.344121+00	2026-07-16 02:10:27.344121+00	\N	\N	autmrmvgh0795lb@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
460	rspmrmvgh07wotg	$2b$10$v96/rL5dK265TzLqOLtWK.ggYItEb50J7Yi0mESlpHHKtdFjB0y4q	rsp mrmvgh07wotg	\N	\N	online	\N	2026-07-16 02:10:32.161045+00	2026-07-16 02:10:32.161045+00	\N	\N	rspmrmvgh07wotg@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
461	delmrmvgpa5uz9j	$2b$10$uHXXKhyTQV80UU3.JwzFxO9wi7.IQIynkypq6yxMl3HFy/6Orf3sq	del mrmvgpa5uz9j	\N	\N	online	\N	2026-07-16 02:10:38.101113+00	2026-07-16 02:10:38.101113+00	\N	\N	delmrmvgpa5uz9j@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
462	viewmrmvgpa5vg4e	$2b$10$2xs67F2WPSU3TNnxJqK.BeQ9nkJQn0l6H/cctEjvZnw8QaTG0Een2	view mrmvgpa5vg4e	\N	\N	online	\N	2026-07-16 02:10:42.050153+00	2026-07-16 02:10:42.050153+00	\N	\N	viewmrmvgpa5vg4e@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
463	fltmrmvgvp0gtj5	$2b$10$FrIOloRErgaN8Q75hjtZNObRSLfXGSBq8YQYPAuPTlEGw7CHBZ.1S	flt mrmvgvp0gtj5	\N	\N	online	\N	2026-07-16 02:10:46.297057+00	2026-07-16 02:10:46.297057+00	\N	\N	fltmrmvgvp0gtj5@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
481	autmrnny2cwc3wf	$2b$10$tX7oZFW6LlOAAQhN9.Bz6Ofwq.apzcFpOMJhh2gLhv5m294NCVFtS	aut mrnny2cwc3wf	\N	\N	online	\N	2026-07-16 15:28:00.982192+00	2026-07-16 15:28:00.982192+00	\N	\N	autmrnny2cwc3wf@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
482	rspmrnny2cwbpya	$2b$10$HzgykBut1tpKSA7Rvgt.O.dW8wjo7ycZgbD9iB8f8a./pnl7UvB3i	rsp mrnny2cwbpya	\N	\N	online	\N	2026-07-16 15:28:05.346405+00	2026-07-16 15:28:05.346405+00	\N	\N	rspmrnny2cwbpya@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
483	autmrnnydhckr3w	$2b$10$9pUDCySBawwc5L4kLRXFk.Xa6FD9phAcH4zSMwXu7jqIpAc9U/nTq	aut mrnnydhckr3w	\N	\N	online	\N	2026-07-16 15:28:11.872201+00	2026-07-16 15:28:11.872201+00	\N	\N	autmrnnydhckr3w@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
484	rspmrnnydhcrv1x	$2b$10$d69vt9Whm6l1itwL5SnU..T.ltUJNC1Oa.cZprOwp0JaO31xBPHhi	rsp mrnnydhcrv1x	\N	\N	online	\N	2026-07-16 15:28:15.987332+00	2026-07-16 15:28:15.987332+00	\N	\N	rspmrnnydhcrv1x@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
485	delmrnnykzpc88e	$2b$10$ZSCwMXkmSLPw.lBFfLtWxu1WE.YYXGwP2QON0cJW/V3B0gY0gBaS2	del mrnnykzpc88e	\N	\N	online	\N	2026-07-16 15:28:21.56411+00	2026-07-16 15:28:21.56411+00	\N	\N	delmrnnykzpc88e@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
486	viewmrnnykzpne0a	$2b$10$epQ2LEm2Z1rTU29qOqBdwOlUUo28GXBqJsPV9chLrLeM0UwmCBn/.	view mrnnykzpne0a	\N	\N	online	\N	2026-07-16 15:28:25.743745+00	2026-07-16 15:28:25.743745+00	\N	\N	viewmrnnykzpne0a@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
487	fltmrnnyrsc3ctp	$2b$10$DPFS0C29A5.OqvENAFxWCeymUgYtWfEcNhMjPjOzSRVdiHH3Pg7A.	flt mrnnyrsc3ctp	\N	\N	online	\N	2026-07-16 15:28:30.400705+00	2026-07-16 15:28:30.400705+00	\N	\N	fltmrnnyrsc3ctp@lfgtest.invalid	f	none	\N	t	\N	f	\N	\N	\N	salla	f
\.


--
-- Data for Name: verification_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.verification_codes (id, user_id, purpose, code_hash, expires_at, consumed_at, attempts, created_at) FROM stdin;
1	18	email_verify	$2b$10$1i80LVYAPfFLZ4q.GOpPN.mQ68cgn5oliIm2vKWmhbryT2C3JzZZG	2026-07-14 02:29:57.353+00	\N	0	2026-07-14 02:19:57.353963+00
23	40	email_verify	$2b$10$EHM5uj2xxHNKxdvsMWCiMOJAjmSJkcS7IEnAZ4G9DYgljqd0TCd4a	2026-07-14 03:07:02.024+00	2026-07-14 02:57:02.206+00	0	2026-07-14 02:57:02.024765+00
2	21	email_verify	$2b$10$8qdb6gZfeWol1nOrxDTZFuCS.e26Z9sTseSbafnIVdA3Cbu8g4Uh.	2026-07-14 02:32:09.528+00	2026-07-14 02:22:10.283+00	1	2026-07-14 02:22:09.52934+00
3	21	twofa_email	$2b$10$AyjU1a8STYR7JahFwmPPRucNTGxxzEembgXX1kIl3y.oUT8RwoIjC	2026-07-14 02:32:10.449+00	\N	0	2026-07-14 02:22:10.44956+00
4	23	email_verify	$2b$10$Le0g9B0NtYagRRYwtKREhODwGGnIXPBoinjIiKc89UCT5FVGxy7la	2026-07-14 02:32:24.691+00	2026-07-14 02:22:25.447+00	1	2026-07-14 02:22:24.691996+00
5	23	twofa_email	$2b$10$4SNgtiAlgWSPEUBp7fR7z.ijmiwdRMO4xnkOk4ohXbPaOici.6FIC	2026-07-14 02:32:25.605+00	2026-07-14 02:22:26.279+00	0	2026-07-14 02:22:25.605294+00
24	40	twofa_email	$2b$10$yi1VHBvKXQQsYcXVYd5LCexxRq9mYDAAH5f8enuxt1jcp2UT60vxi	2026-07-14 03:07:02.28+00	2026-07-14 02:57:02.354+00	0	2026-07-14 02:57:02.280781+00
6	23	twofa_email	$2b$10$awQPBiN2rIUfO8fU6wo1eOExV//BuIYNwAx2WkePUK6J5lW/UGTMq	2026-07-14 02:32:26.419+00	2026-07-14 02:22:27.171+00	1	2026-07-14 02:22:26.419878+00
42	153	email_verify	$2b$10$8/kadMBSXNyzE3U6Jixa8.DbfHr6OBdJfzmQsRiZZBLQilRzxi/S.	2026-07-15 00:59:57.664+00	\N	0	2026-07-15 00:49:57.664665+00
25	40	twofa_email	$2b$10$Fn18VyW4QngoziQwv6QvB.POZlN0SKecoHI8/iAbBl3ehjWN8pTmO	2026-07-14 03:07:02.492+00	2026-07-14 02:57:02.652+00	1	2026-07-14 02:57:02.492606+00
43	154	email_verify	$2b$10$wXZoO4995EQAZA4njth9FeoW5ba68UuFJrXo4lyRSh.F8aHRCcqSK	2026-07-15 01:00:06.819+00	\N	0	2026-07-15 00:50:06.820718+00
7	23	password_reset	$2b$10$nySUWlQCVhzoVaqAiovrx.pgkMhuLyjp6Zmkp.muCTBEV7ceCpBBy	2026-07-14 02:32:27.327+00	2026-07-14 02:22:28.373+00	5	2026-07-14 02:22:27.32775+00
8	23	password_reset	$2b$10$qdqlrchbCI2b/NtpIRcuUuZGh.SJcpeDcvBsSZXXIL8ospqYoreH6	2026-07-14 02:32:28.376+00	2026-07-14 02:22:29.055+00	0	2026-07-14 02:22:28.376833+00
9	25	email_verify	$2b$10$CDVhKa0gBn.uQDjDqTWTqO.Qwapg7OWEySRhXN9/i5ro1aoY8Qp/a	2026-07-14 02:44:08.675+00	\N	0	2026-07-14 02:34:08.6755+00
10	30	email_verify	$2b$10$N/GakhP7g8HFNRKuesINW.uIfBsbwoPf0LLG/IOTVb6ZRsVpakW6y	2026-07-14 02:47:11.831+00	\N	0	2026-07-14 02:37:11.831271+00
11	6	email_verify	$2b$10$hglDNVBOrcqwVzOBM.Sq.eufr5v/FWifwR.HfIppaU/5YpntlKMTi	2026-07-14 02:48:00.44+00	2026-07-14 02:39:59.935+00	0	2026-07-14 02:38:00.44029+00
12	6	email_verify	$2b$10$KXNXNsJZS/38nv3bumUSzeAgBpUFM5ashNbIjflXRNKYlKv27qfri	2026-07-14 02:49:59.939+00	2026-07-14 02:47:11.102+00	0	2026-07-14 02:39:59.939464+00
13	6	email_verify	$2b$10$bWP3wBYcI2h54UXmliSb8uF8MZIIxH6UM4QkvitmwmEfdc3ABy8z2	2026-07-14 02:57:11.105+00	2026-07-14 02:52:49.762+00	0	2026-07-14 02:47:11.105908+00
15	34	email_verify	$2b$10$GrKZdyGFmEwhiG6N9Je9W.QWzr5RZgA.FGqW27m/Jvf1X0W5rCDzW	2026-07-14 03:05:07.657+00	2026-07-14 02:55:07.849+00	0	2026-07-14 02:55:07.657983+00
16	34	twofa_email	$2b$10$jVPTyb6ateI/zvuYCZCVhui2LV3vSGCG4nz17/kgXaOubTxe1suB6	2026-07-14 03:05:07.934+00	\N	0	2026-07-14 02:55:07.934357+00
17	36	email_verify	$2b$10$7kKLxwpUftz42GcyEo4M2.J7/kgwoaxo.YnY9SuQdSIn/wAFeDqTe	2026-07-14 03:05:51.268+00	2026-07-14 02:55:51.35+00	0	2026-07-14 02:55:51.270301+00
18	36	twofa_email	$2b$10$nfUTH36BPBLKZMMxblXyeuZ45HNDIUppeykzDdVboKqHfQsIMC.ve	2026-07-14 03:05:51.485+00	2026-07-14 02:55:51.573+00	0	2026-07-14 02:55:51.48608+00
19	38	email_verify	$2b$10$Faa92Pz6jwITSjs2KZAgDemV9gFEmdlXsqU.imrytHQng/uFYIB3e	2026-07-14 03:06:20.649+00	2026-07-14 02:56:20.836+00	0	2026-07-14 02:56:20.649735+00
20	38	twofa_email	$2b$10$5sjPqLOv2htdsRa.ASrzSuCDJC.JY/Spc2C0a89rM0vbyJ0g0Ifym	2026-07-14 03:06:20.915+00	2026-07-14 02:56:20.992+00	0	2026-07-14 02:56:20.915998+00
44	155	email_verify	$2b$10$WzwT6QsRP8dJ3vFlDR0JdeWNK8eiHf1fGZu7Dma3YTX9FC2tRaNLO	2026-07-15 01:00:12.166+00	\N	0	2026-07-15 00:50:12.166903+00
21	38	twofa_email	$2b$10$o7atMLafIvJXvNYs/z/Xt.W//iQfzYeVR7vguP62kt6drLIFOl5N2	2026-07-14 03:06:21.135+00	2026-07-14 02:56:21.288+00	1	2026-07-14 02:56:21.136067+00
45	156	email_verify	$2b$10$uI4dGUuhBzOzAiOjlUZGWud2F6lkXUoxruT4yFGGivzMBg2RhGK42	2026-07-15 01:00:20.086+00	\N	0	2026-07-15 00:50:20.087877+00
46	157	email_verify	$2b$10$vohESHSANsB0BWsovVB1k.Di/ZsAcbsHeZuMjz1remW.0pkWXw7M.	2026-07-15 01:11:05.312+00	\N	0	2026-07-15 01:01:05.313067+00
26	40	twofa_email	$2b$10$QeRInjA1fPbcqWfD4Y8oLOd2XTKDyIZ1QaOyjeMTpadELcsPgUGSG	2026-07-14 03:07:02.8+00	\N	5	2026-07-14 02:57:02.8007+00
14	6	email_verify	$2b$10$mfYVzMRBgTafHZ.YP2PfJ.fhjORCqgJ64CyJR9NmQHiNVIgdrwjN2	2026-07-14 03:02:49.775+00	2026-07-14 10:48:40.877+00	0	2026-07-14 02:52:49.775345+00
22	38	twofa_email	$2b$10$6GqZJebY4cuQruUZciMcwu79v9tofwGxPWCdttCifoP.cX0FElFpC	2026-07-14 03:06:21.43+00	\N	5	2026-07-14 02:56:21.431067+00
27	6	email_verify	$2b$10$zyFKaqwrBOOntTVKYb.tM.pAr9GhMDGJnT/bIhBG0f94FZAszrn0G	2026-07-14 10:58:40.884+00	\N	0	2026-07-14 10:48:40.885432+00
28	45	email_verify	$2b$10$OOVYx.oubJUIz9Qdb5NsU.MzIBOxdtLfjPPMVFRYbtusCyBwcMxLG	2026-07-14 11:00:59.383+00	\N	0	2026-07-14 10:50:59.383892+00
29	56	email_verify	$2b$10$LSRUxYAXPcr7YrYLJ/B6zuCC9Nds8Sm4S6EFaUwcTAaRzsiPbY5Fe	2026-07-14 20:53:29.627+00	\N	0	2026-07-14 20:43:29.628007+00
30	57	email_verify	$2b$10$ZpX3KNOx78vgyn7FB6LINuu/CyxSCHUAQvW77KKfsXm5IpfWPhhwK	2026-07-14 23:36:24.391+00	\N	0	2026-07-14 23:26:24.391444+00
31	127	email_verify	$2b$10$1IC33ESlT/IPFp9A8LQheuHZmPZfvvlq2s.P4MONj2mrLU904VwS2	2026-07-15 00:56:42.87+00	\N	0	2026-07-15 00:46:42.871434+00
32	128	email_verify	$2b$10$JDzWPBZZrXooYiEterGE5.NlQT47nDENfz.6Nmnk16HQQq1INUp3S	2026-07-15 00:56:47.971+00	\N	0	2026-07-15 00:46:47.971333+00
33	129	email_verify	$2b$10$4bE3Vs3IosGuLFMULjMNqufAObSh36LDMamz9tyZPG9TuWO5qQx/.	2026-07-15 00:56:53.983+00	\N	0	2026-07-15 00:46:53.984229+00
34	130	email_verify	$2b$10$uAR0fRNfFWgIL2Axp9MM2eZA1wboyED1RI5du6KXwfmhZdbgx5NR2	2026-07-15 00:56:59.056+00	\N	0	2026-07-15 00:46:59.056551+00
35	131	email_verify	$2b$10$9U13Kb2KRZeb4dEiD.eUxuFyiTnDIKDSJ1eE8DGSrrmhnhZek15hW	2026-07-15 00:57:07.21+00	\N	0	2026-07-15 00:47:07.213272+00
36	132	email_verify	$2b$10$9/HEy77TWvLX8VIFTHrCTOhjfsaiiA1u7nOfs.iIUhxwX2HI9O5gm	2026-07-15 00:57:57.83+00	\N	0	2026-07-15 00:47:57.831087+00
37	133	email_verify	$2b$10$aICUZ2wrmkuheD0Ux2MDYOPbfk6Xa99sgB/jWiSBcBZnrpkkFaFky	2026-07-15 00:58:02.764+00	\N	0	2026-07-15 00:48:02.765471+00
38	134	email_verify	$2b$10$h6bhqZsJeIY/4zjXzKdbdeE5mViZjzZjJ1bpK6ihnaKu9jdq.pPAu	2026-07-15 00:58:10.008+00	\N	0	2026-07-15 00:48:10.00866+00
39	135	email_verify	$2b$10$TLBlxyIyvGuLQO161MYgZ.C4docFUZeesMwSDx3j4fTEHZHkjV3Xq	2026-07-15 00:58:15.639+00	\N	0	2026-07-15 00:48:15.639885+00
40	136	email_verify	$2b$10$h7a4wuZ6L8llnt.gMkL3jensKSkntsWzM.yYFT9BOnaMH8zrxUB0u	2026-07-15 00:58:21.997+00	\N	0	2026-07-15 00:48:21.997668+00
41	140	email_verify	$2b$10$r.8YI2EW/hNrzkJSW76.YeFgUARmfQ4OUclk8tiJaK20RJGb.D1A6	2026-07-15 00:59:39.305+00	\N	0	2026-07-15 00:49:39.307694+00
47	158	email_verify	$2b$10$YAKD3.6/tngO2xRGYC.VGO4Uin8y5chpOrusEOA/pI7M05fkMAOUK	2026-07-15 01:11:10.854+00	\N	0	2026-07-15 01:01:10.856721+00
48	159	email_verify	$2b$10$rzbLUZ5l7i1EQ/tu2BUv3u0W2nszigML1RLx1SYeR/2AwJhOQ.6UG	2026-07-15 01:11:18.425+00	\N	0	2026-07-15 01:01:18.426029+00
49	160	email_verify	$2b$10$fEjr5d0IBSmStrE.16BTkuXkaE13cl6BnBCd5W34H5RFJ0aDyXAgu	2026-07-15 01:11:23.957+00	\N	0	2026-07-15 01:01:23.957729+00
50	161	email_verify	$2b$10$aIDjhnz40DgBUxiHYZioFOfDWt7FkD4jL6yDQkPYflZ.mJ8TP7P/u	2026-07-15 01:11:31.71+00	\N	0	2026-07-15 01:01:31.71047+00
51	165	email_verify	$2b$10$nLAnBkTaEDOhVaGUP7BULepetsCiL64OYPw3.eINgm6ejshVzBGFK	2026-07-15 01:12:19.99+00	\N	0	2026-07-15 01:02:19.990669+00
52	178	email_verify	$2b$10$fGYJ2lyukGGlmZPH/0ajyeOFd47Kmw9zU3b90gNZI40XfUZ6K9Ms2	2026-07-15 01:12:36.893+00	\N	0	2026-07-15 01:02:36.894765+00
53	179	email_verify	$2b$10$q72jTVIEr0mYU9GhWSGReOLcXsWPeC.97P6vszr9y8ANM05nWaQBK	2026-07-15 01:12:45.838+00	\N	0	2026-07-15 01:02:45.839202+00
54	180	email_verify	$2b$10$1pETQqCY1vv3eP62bnwsO.f7.w3DboyPLXb0TB0sG0ziS6AHTWsJ.	2026-07-15 01:12:51.315+00	\N	0	2026-07-15 01:02:51.316466+00
55	181	email_verify	$2b$10$ZpiMlBwvhagLLOlMsKPEsuZr7Avajtfre/7ThyD.WBqXEVH8dQk52	2026-07-15 01:12:59.062+00	\N	0	2026-07-15 01:02:59.062517+00
56	212	email_verify	$2b$10$vN6jlKRgS5NgRXaG626eROv4H4jaiKoktn9g.59nJA4I5nSltPRnq	2026-07-15 01:16:47.531+00	\N	0	2026-07-15 01:06:47.53191+00
57	213	email_verify	$2b$10$6n6h0rrPa3PQACqTjJJBFOsecYweWyyFKg4zIJ6g6bOeP9206Hs.O	2026-07-15 01:16:53.376+00	\N	0	2026-07-15 01:06:53.37648+00
58	214	email_verify	$2b$10$6RyIFRi7wVWDBAqXp.8w/e590I5.USKMyNwbUXtWtturQTBZYdO/.	2026-07-15 01:17:02.421+00	\N	0	2026-07-15 01:07:02.421837+00
59	215	email_verify	$2b$10$priHN9WMhYjiiV0oSw2mUe06gbFG98lGoRU8G6LFY9wAAPWyHRX3i	2026-07-15 01:17:08.214+00	\N	0	2026-07-15 01:07:08.218974+00
60	216	email_verify	$2b$10$lORai6SF4fcewbJH.n2CBegrH.h68pXhaLtu9rIQPxTuNEitnjKOy	2026-07-15 01:17:15.539+00	\N	0	2026-07-15 01:07:15.539984+00
61	217	email_verify	$2b$10$vijIpBDkWxW6N.VlqEd0hOSVwXISml.3Ojdaqg.9gSJvX87ziCwni	2026-07-15 01:20:53.84+00	\N	0	2026-07-15 01:10:53.841016+00
62	218	email_verify	$2b$10$RatrJR/CcqxGekZk0p2I3OOa3phf0Yl5sDBiP6qkx2y/XRDAIGtla	2026-07-15 01:20:59.293+00	\N	0	2026-07-15 01:10:59.29356+00
63	219	email_verify	$2b$10$CYkLUGhLkkC7/UNZL9EwPOBtoCni6ex/F6vnqkkJgw2YzTRRgtQ1O	2026-07-15 01:21:06.63+00	\N	0	2026-07-15 01:11:06.631232+00
64	220	email_verify	$2b$10$FjwwkeFhANy.jE20D2QH/ue5QKR4sstFB/HL1Hb9BNCNhihHAFn/O	2026-07-15 01:21:13.312+00	\N	0	2026-07-15 01:11:13.312645+00
65	221	email_verify	$2b$10$CFaCLXFs.Grz2H8r2PUcQeyuFp3YLRMPaxfyaOkRXI5hqSrk567LS	2026-07-15 01:21:20.914+00	\N	0	2026-07-15 01:11:20.91475+00
66	222	email_verify	$2b$10$.P6NZp4bdJMx72csfnCm8eUfjUf9iZxQErPGDzpgPmWylLt3KFyAm	2026-07-15 01:21:26.862+00	\N	0	2026-07-15 01:11:26.862654+00
67	223	email_verify	$2b$10$VS7Mk75UYu28wriamjRv2OHs.eQkKTzNZ5WOj92xBc157nyzlHI36	2026-07-15 01:21:32.341+00	\N	0	2026-07-15 01:11:32.342594+00
68	230	email_verify	$2b$10$ycsZkCBnMTLGPsTOcK6JyeBeGQ49zJ53puzdcBEtZpRyK8WUCOdaC	2026-07-15 01:22:56.402+00	\N	0	2026-07-15 01:12:56.402707+00
69	237	email_verify	$2b$10$gLo.jB9HYZwdB4/AuOejnOHceKy4ILzfQRlNF5lW3FMDz4XRr.gZC	2026-07-15 01:23:05.049+00	\N	0	2026-07-15 01:13:05.049736+00
70	241	email_verify	$2b$10$8POZOoaVSnexCdOx7aW1LONj28Iq.y4z6JnYRPIe2Hy14s0frwxRm	2026-07-15 01:23:16.835+00	\N	0	2026-07-15 01:13:16.838133+00
71	242	email_verify	$2b$10$/DqcrZi4Inoli6bJpXAlze1N2OmxxXyo64v1WfD0ToQ.DAxYLl9c2	2026-07-15 01:23:22.47+00	\N	0	2026-07-15 01:13:22.47118+00
72	243	email_verify	$2b$10$QvYBplwfhhxyl/kwxZkAROsN5caXPOTMuXSaptaeMVFEncX7Fm3OG	2026-07-15 01:23:30.132+00	\N	0	2026-07-15 01:13:30.132385+00
73	244	email_verify	$2b$10$MP2HVDPh395F29mvxD0nRO1vIHHfo4DnERya6EdYgdsSeDpb2UTBO	2026-07-15 01:23:35.687+00	\N	0	2026-07-15 01:13:35.687659+00
74	245	email_verify	$2b$10$tXh2YSU2RquZj5eV8HS8iuEAdpHuWS4HMRVaRQ6WEQOvPYkyp5gEi	2026-07-15 01:23:41.9+00	\N	0	2026-07-15 01:13:41.901112+00
75	263	email_verify	$2b$10$MQC1xJS6G5UFdRNKySDnNuh2.WCYDOpWmZiq2gVV8EjNFz7gRZHMm	2026-07-15 03:51:38.775+00	\N	0	2026-07-15 03:41:38.775554+00
76	264	email_verify	$2b$10$OrovJW9cWfnciaNnKTfBmeoi5Wnet9quTFKFaWjcUocn22Ig9Lihq	2026-07-15 03:51:44.836+00	\N	0	2026-07-15 03:41:44.837037+00
77	265	email_verify	$2b$10$Uo4J9lu8Z1D0F5df12NUbOY8s9LSgqa1j7BeboGquxtkfrn..L2vW	2026-07-15 03:51:53.551+00	\N	0	2026-07-15 03:41:53.556465+00
78	266	email_verify	$2b$10$5QQv7caOxf3/4CKqvs7ngecf/EIP9aWztl9c.hIEknvZ3bZXS9ce6	2026-07-15 03:51:59.501+00	\N	0	2026-07-15 03:41:59.501784+00
79	267	email_verify	$2b$10$eC4cHCl54sP/rGMJvLlx1Oem0LJNZQ9b560QPRwY.r/JmwN1gflDG	2026-07-15 03:52:06.374+00	\N	0	2026-07-15 03:42:06.374934+00
80	268	email_verify	$2b$10$cAOMQ29nVC9Yn9hAwZilQukjC7AXhpwDOHSokSRzruk6wMTq7QPAy	2026-07-15 03:52:11.171+00	\N	0	2026-07-15 03:42:11.171528+00
81	269	email_verify	$2b$10$CtZkO1bHUAiGRozH1kqq3.dJBByXGm1hHfo2rrAU98lQ7VaWp3tbC	2026-07-15 03:52:17.124+00	\N	0	2026-07-15 03:42:17.125027+00
82	287	email_verify	$2b$10$AdKdfi02Q4IbO06qSNPRZeGs.1xhruM1uTLzuz1FlsZdghOz1ElHW	2026-07-15 06:06:54.18+00	\N	0	2026-07-15 05:56:54.181328+00
83	288	email_verify	$2b$10$S9iEz3AhYMUgc9aKFRikyOgoTQVaRATCDkaN3ZDi6kX3JefX.99OO	2026-07-15 06:06:58.605+00	\N	0	2026-07-15 05:56:58.606276+00
84	289	email_verify	$2b$10$zH9pjDw6s65oK855BY6RxegYnpBjSSxe39nc17nqT6JzGpXOqjgOW	2026-07-15 06:07:05.797+00	\N	0	2026-07-15 05:57:05.797594+00
85	290	email_verify	$2b$10$6orvKcfmGnk61fhkj9OogO9o978EP6qCL064PnFxeJGYgPsKkLMae	2026-07-15 06:07:10.144+00	\N	0	2026-07-15 05:57:10.144995+00
86	291	email_verify	$2b$10$iAfp7rmx1fnNyGTVL0oNpu/0kWJhwjqLDblvztHPHASvMZdP/ryAW	2026-07-15 06:07:16.212+00	\N	0	2026-07-15 05:57:16.212681+00
87	292	email_verify	$2b$10$SzmTJoyN0T8jC7gOsJBHDeJL3jNK1tR5JEIIqNFykANT02puxf1RW	2026-07-15 06:07:20.291+00	\N	0	2026-07-15 05:57:20.291733+00
88	293	email_verify	$2b$10$ZYnM4ZKRGXQQpI6EHvftsOGrULnQJc9850qoiZKuREtBMUiduGhwK	2026-07-15 06:07:24.963+00	\N	0	2026-07-15 05:57:24.967005+00
89	308	email_verify	$2b$10$rOCGu37un9fQDwVWtuKKl.MpvJzj1XpGF9BoM63MOr09qnU447yCW	2026-07-15 12:06:53.863+00	\N	0	2026-07-15 11:56:53.863354+00
90	312	email_verify	$2b$10$TfF86NdQXM4vLXRI56Zgnuhrjim3pE4sNH3Vd1LRMBwNEOkOTm52G	2026-07-15 12:06:58.835+00	\N	0	2026-07-15 11:56:58.835902+00
91	313	email_verify	$2b$10$zwrWc1cEEgKlUtsxVrVSZ.l1smOtiUyJ1EVEXWZShReDSY4ddMh.K	2026-07-15 12:07:05.685+00	\N	0	2026-07-15 11:57:05.686392+00
92	314	email_verify	$2b$10$e4K8Ri00QuPSjmHX1wiX5Omr4BJVjFl4Ft9gZTWvoduP4RP.iRC72	2026-07-15 12:07:09.469+00	\N	0	2026-07-15 11:57:09.46978+00
93	315	email_verify	$2b$10$NUkztClhv7FGH7Ojh6NIYe6yxIdNisNj6eZL9HZxKyFRXtTMlsq5a	2026-07-15 12:07:15.073+00	\N	0	2026-07-15 11:57:15.074048+00
94	316	email_verify	$2b$10$S9lNQwt.iQTHwfL.R5XvbO8JYnedZZULXs.txipWkIguV092WDC3i	2026-07-15 12:07:19.187+00	\N	0	2026-07-15 11:57:19.188125+00
95	317	email_verify	$2b$10$CtTnQk2Zl25fl14yKwcYXemt/OEDrC8ScyuFndq52TECbE2pLCsIC	2026-07-15 12:07:24.509+00	\N	0	2026-07-15 11:57:24.509974+00
96	335	email_verify	$2b$10$qBz3Qi193zV0fTUbN86dv.bn92H4FjecmWAUNzI5KS2WVWAeXRLjC	2026-07-15 20:20:07.334+00	\N	0	2026-07-15 20:10:07.334647+00
97	336	email_verify	$2b$10$LeyLCv8nPnmTmhk0HneFYu8lqfwQ8JEPo8glV.li1.ykdpMNn3Bau	2026-07-15 20:20:11.758+00	\N	0	2026-07-15 20:10:11.758278+00
98	337	email_verify	$2b$10$ckECpT/NSr2kB8h1Ab1Jv.RwWfA5l8KOAyv.Hll/zCqdVftYkWf.K	2026-07-15 20:20:17.614+00	\N	0	2026-07-15 20:10:17.615525+00
99	338	email_verify	$2b$10$/oZMDi9K.e30kJ2vqzuZfO4QtwHH.eQr7azlGVtTd3FN30ObEMtOO	2026-07-15 20:20:21.768+00	\N	0	2026-07-15 20:10:21.768778+00
100	339	email_verify	$2b$10$ajfjXg3CiZgQ8F4tcYKI1eprCkRMCMtCNjgP8XVCyYgKwRNo6JCbi	2026-07-15 20:20:27.389+00	\N	0	2026-07-15 20:10:27.389689+00
101	340	email_verify	$2b$10$ouTN68l4EWFMQri2NdAfguJz3feD2GQoDG4vl6qK2lGRwB7p.cW2i	2026-07-15 20:20:31.628+00	\N	0	2026-07-15 20:10:31.62903+00
102	341	email_verify	$2b$10$9SB4f.9iM8MYn/EiS7hZ7.3JsVqTItkEAAkFH4O1kMwGTtEjymWva	2026-07-15 20:20:36.28+00	\N	0	2026-07-15 20:10:36.281266+00
103	359	email_verify	$2b$10$Ov2ckI2q0sss85PvigOXpujFOco4M.A6rypePV5vlk70B9.w3aeBO	2026-07-15 22:26:36.064+00	\N	0	2026-07-15 22:16:36.065433+00
104	360	email_verify	$2b$10$zCwyPAYS5wocv.UdrXRlGeZsTplBKGhqGKQviSIA3mTXx5gCr6pn.	2026-07-15 22:26:41.363+00	\N	0	2026-07-15 22:16:41.364481+00
105	361	email_verify	$2b$10$MR/uXUHCP4rus9RJcoXSz.STs2UOxdGE9A0Oyk04ummgrRryPJeCG	2026-07-15 22:26:47.214+00	\N	0	2026-07-15 22:16:47.214499+00
106	362	email_verify	$2b$10$CA0iNbl54kcvb3kk.o5cqebwyxIyZHppmOwdDD4T1go.rXqSoXx1.	2026-07-15 22:26:51.725+00	\N	0	2026-07-15 22:16:51.72534+00
107	363	email_verify	$2b$10$0eMKs8yXhlGMA8tN/TIOvOm.CDnxUgq.1oe.0yn5DRC2vg1E5f8..	2026-07-15 22:26:58.214+00	\N	0	2026-07-15 22:16:58.214504+00
108	364	email_verify	$2b$10$km5KV4zVhm/Jdra9OOwz/e3do6ve3JJ21n61ibHq5kRKf8Zh6dmQu	2026-07-15 22:27:02.847+00	\N	0	2026-07-15 22:17:02.848104+00
109	365	email_verify	$2b$10$jZ.5sAPuuzpoDvUIe.RQM.gMHaYpZYk0Z5m0sQbwuQc3sozSHKOze	2026-07-15 22:27:08.164+00	\N	0	2026-07-15 22:17:08.165031+00
110	457	email_verify	$2b$10$SgVqgn9NC9aYKvZBK5CGy.SObQ4fqlhWpiN76JntTlTXLmtb3YlxG	2026-07-16 02:20:16.352+00	\N	0	2026-07-16 02:10:16.352767+00
111	458	email_verify	$2b$10$N7E63MLS0yYzUHRehBjHc.U5KYCVTar7WjqDBq0jrZG/80Ma.Un6e	2026-07-16 02:20:21.225+00	\N	0	2026-07-16 02:10:21.225844+00
112	459	email_verify	$2b$10$ZAGRCP6Av75RB.2CtbbN.ei97Mt7f2Iz4bTnsQ2IpSdTE/lSoITyW	2026-07-16 02:20:27.435+00	\N	0	2026-07-16 02:10:27.436279+00
113	460	email_verify	$2b$10$zKsd2Hs6bRMBWOO1.VxRbOLgTMkQAsLDgHZ0wN9.xDGUXxp4LB6Nq	2026-07-16 02:20:32.255+00	\N	0	2026-07-16 02:10:32.25582+00
114	461	email_verify	$2b$10$H.qpRtVXdHX4YXhBojRnieoWvrgCpp9sRm/jVtYBEu/3iCYALtzfu	2026-07-16 02:20:38.22+00	\N	0	2026-07-16 02:10:38.22063+00
115	462	email_verify	$2b$10$bYng5mrFqD8o7pRRKFZaDOtuJznRvZiNBBO16v2XUOtoFCAMVY8p2	2026-07-16 02:20:42.133+00	\N	0	2026-07-16 02:10:42.133646+00
116	463	email_verify	$2b$10$yTGZ/TyE.iNiV4xdZuvDNuTOb.vPz3i1PpygGnYnvzvy8hcrnKRKa	2026-07-16 02:20:46.384+00	\N	0	2026-07-16 02:10:46.384993+00
117	481	email_verify	$2b$10$1062C1ispds1ujgZPflrNOQK25UKXgTPH6ErntqvGwXTPBo9PRcBu	2026-07-16 15:38:01.086+00	\N	0	2026-07-16 15:28:01.086668+00
118	482	email_verify	$2b$10$nPyMeRiF2uMuB6M4oM9Xh..jXkk4yj7XpKmxxtJu5HjAVwzUTOt2W	2026-07-16 15:38:05.436+00	\N	0	2026-07-16 15:28:05.436668+00
119	483	email_verify	$2b$10$EMhaiL8pR1eC9WbKEIRzCuX0/yhl9LKOzhMybx1z.s2i6FPVgyEQG	2026-07-16 15:38:11.946+00	\N	0	2026-07-16 15:28:11.947122+00
120	484	email_verify	$2b$10$n2P4ZCId0q0PHoWcSp5dPeZpSp5a1EZRSZ/zq0qZwx0/ZbMQF908u	2026-07-16 15:38:16.088+00	\N	0	2026-07-16 15:28:16.088539+00
121	485	email_verify	$2b$10$LdpH7q9per1ZCkOSEWQcB.caQBU9nnIk6ff338rWkGpCaERs8qz5e	2026-07-16 15:38:21.673+00	\N	0	2026-07-16 15:28:21.674352+00
122	486	email_verify	$2b$10$hDpkvVoy1ULAwneNKykmZuC4SZSw2jwE7tBzqtHZCe1q48juFxOX2	2026-07-16 15:38:25.849+00	\N	0	2026-07-16 15:28:25.850467+00
123	487	email_verify	$2b$10$I95wue3yC2YSPOvn/r0j2.bTmspE9ankFvaqCnEcWbUqAclbKo9XC	2026-07-16 15:38:30.491+00	\N	0	2026-07-16 15:28:30.491833+00
\.


--
-- Name: activation_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.activation_codes_id_seq', 1, false);


--
-- Name: blocks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.blocks_id_seq', 3, true);


--
-- Name: content_links_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.content_links_id_seq', 12, true);


--
-- Name: conversation_participants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.conversation_participants_id_seq', 410, true);


--
-- Name: conversations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.conversations_id_seq', 71, true);


--
-- Name: friend_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.friend_requests_id_seq', 10, true);


--
-- Name: friendships_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.friendships_id_seq', 18, true);


--
-- Name: game_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.game_accounts_id_seq', 11, true);


--
-- Name: games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.games_id_seq', 10, true);


--
-- Name: lfg_posts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.lfg_posts_id_seq', 224, true);


--
-- Name: lfg_responses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.lfg_responses_id_seq', 178, true);


--
-- Name: linked_games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.linked_games_id_seq', 2565, true);


--
-- Name: message_reactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.message_reactions_id_seq', 1, false);


--
-- Name: message_reads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.message_reads_id_seq', 6, true);


--
-- Name: messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.messages_id_seq', 108, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notifications_id_seq', 503, true);


--
-- Name: owner_activity_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.owner_activity_log_id_seq', 1, true);


--
-- Name: parties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.parties_id_seq', 80, true);


--
-- Name: party_activity_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.party_activity_id_seq', 520, true);


--
-- Name: party_invites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.party_invites_id_seq', 330, true);


--
-- Name: party_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.party_members_id_seq', 407, true);


--
-- Name: platform_links_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_links_id_seq', 6, true);


--
-- Name: pro_subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pro_subscriptions_id_seq', 1, true);


--
-- Name: profile_comments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.profile_comments_id_seq', 10, true);


--
-- Name: profile_photos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.profile_photos_id_seq', 243, true);


--
-- Name: super_admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.super_admins_id_seq', 1, true);


--
-- Name: user_games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_games_id_seq', 24, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 504, true);


--
-- Name: verification_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.verification_codes_id_seq', 123, true);


--
-- Name: activation_codes activation_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT activation_codes_code_unique UNIQUE (code);


--
-- Name: activation_codes activation_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT activation_codes_pkey PRIMARY KEY (id);


--
-- Name: blocks blocks_blocker_blocked_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocker_blocked_uq UNIQUE (blocker_id, blocked_id);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- Name: content_links content_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_links
    ADD CONSTRAINT content_links_pkey PRIMARY KEY (id);


--
-- Name: content_links content_links_user_platform_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_links
    ADD CONSTRAINT content_links_user_platform_uq UNIQUE (user_id, platform);


--
-- Name: conversation_participants conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: game_accounts game_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_accounts
    ADD CONSTRAINT game_accounts_pkey PRIMARY KEY (id);


--
-- Name: game_accounts game_accounts_user_platform_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_accounts
    ADD CONSTRAINT game_accounts_user_platform_uq UNIQUE (user_id, platform);


--
-- Name: games games_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_name_unique UNIQUE (name);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: lfg_posts lfg_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfg_posts
    ADD CONSTRAINT lfg_posts_pkey PRIMARY KEY (id);


--
-- Name: lfg_responses lfg_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfg_responses
    ADD CONSTRAINT lfg_responses_pkey PRIMARY KEY (id);


--
-- Name: lfg_responses lfg_responses_post_user_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfg_responses
    ADD CONSTRAINT lfg_responses_post_user_uq UNIQUE (post_id, user_id);


--
-- Name: linked_games linked_games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linked_games
    ADD CONSTRAINT linked_games_pkey PRIMARY KEY (id);


--
-- Name: linked_games linked_games_user_platform_name_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linked_games
    ADD CONSTRAINT linked_games_user_platform_name_uq UNIQUE (user_id, platform, name);


--
-- Name: message_reactions message_reactions_message_id_user_id_emoji_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (message_id, user_id, emoji);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- Name: message_reads message_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads
    ADD CONSTRAINT message_reads_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: owner_activity_log owner_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_activity_log
    ADD CONSTRAINT owner_activity_log_pkey PRIMARY KEY (id);


--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);


--
-- Name: party_activity party_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_activity
    ADD CONSTRAINT party_activity_pkey PRIMARY KEY (id);


--
-- Name: party_invites party_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_invites
    ADD CONSTRAINT party_invites_pkey PRIMARY KEY (id);


--
-- Name: party_members party_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_members
    ADD CONSTRAINT party_members_pkey PRIMARY KEY (id);


--
-- Name: platform_links platform_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_links
    ADD CONSTRAINT platform_links_pkey PRIMARY KEY (id);


--
-- Name: pro_subscriptions pro_subscriptions_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_subscriptions
    ADD CONSTRAINT pro_subscriptions_order_id_unique UNIQUE (order_id);


--
-- Name: pro_subscriptions pro_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_subscriptions
    ADD CONSTRAINT pro_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: profile_comments profile_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_comments
    ADD CONSTRAINT profile_comments_pkey PRIMARY KEY (id);


--
-- Name: profile_photos profile_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_photos
    ADD CONSTRAINT profile_photos_pkey PRIMARY KEY (id);


--
-- Name: super_admins super_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_admins
    ADD CONSTRAINT super_admins_pkey PRIMARY KEY (id);


--
-- Name: super_admins super_admins_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_admins
    ADD CONSTRAINT super_admins_username_unique UNIQUE (username);


--
-- Name: user_games user_games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_games
    ADD CONSTRAINT user_games_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: verification_codes verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_codes
    ADD CONSTRAINT verification_codes_pkey PRIMARY KEY (id);


--
-- Name: party_invites_pending_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX party_invites_pending_uq ON public.party_invites USING btree (party_id, invited_user_id) WHERE (status = 'pending'::text);


--
-- Name: profile_comments_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_comments_profile_idx ON public.profile_comments USING btree (profile_user_id, created_at);


--
-- Name: profile_photos_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_photos_user_idx ON public.profile_photos USING btree (user_id, created_at);


--
-- Name: verification_codes_user_purpose_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_codes_user_purpose_idx ON public.verification_codes USING btree (user_id, purpose);


--
-- Name: activation_codes activation_codes_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activation_codes
    ADD CONSTRAINT activation_codes_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: blocks blocks_blocked_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocked_id_users_id_fk FOREIGN KEY (blocked_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_blocker_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocker_id_users_id_fk FOREIGN KEY (blocker_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: content_links content_links_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_links
    ADD CONSTRAINT content_links_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_from_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_from_user_id_users_id_fk FOREIGN KEY (from_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_to_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_to_user_id_users_id_fk FOREIGN KEY (to_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_friend_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_friend_id_users_id_fk FOREIGN KEY (friend_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: game_accounts game_accounts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_accounts
    ADD CONSTRAINT game_accounts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: lfg_posts lfg_posts_author_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfg_posts
    ADD CONSTRAINT lfg_posts_author_id_users_id_fk FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: lfg_responses lfg_responses_post_id_lfg_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfg_responses
    ADD CONSTRAINT lfg_responses_post_id_lfg_posts_id_fk FOREIGN KEY (post_id) REFERENCES public.lfg_posts(id) ON DELETE CASCADE;


--
-- Name: lfg_responses lfg_responses_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lfg_responses
    ADD CONSTRAINT lfg_responses_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: linked_games linked_games_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linked_games
    ADD CONSTRAINT linked_games_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: message_reads message_reads_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads
    ADD CONSTRAINT message_reads_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: message_reads message_reads_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads
    ADD CONSTRAINT message_reads_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: messages messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: parties parties_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: parties parties_leader_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_leader_id_users_id_fk FOREIGN KEY (leader_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: party_activity party_activity_actor_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_activity
    ADD CONSTRAINT party_activity_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: party_activity party_activity_party_id_parties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_activity
    ADD CONSTRAINT party_activity_party_id_parties_id_fk FOREIGN KEY (party_id) REFERENCES public.parties(id) ON DELETE CASCADE;


--
-- Name: party_invites party_invites_invited_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_invites
    ADD CONSTRAINT party_invites_invited_by_user_id_users_id_fk FOREIGN KEY (invited_by_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: party_invites party_invites_invited_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_invites
    ADD CONSTRAINT party_invites_invited_user_id_users_id_fk FOREIGN KEY (invited_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: party_invites party_invites_party_id_parties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_invites
    ADD CONSTRAINT party_invites_party_id_parties_id_fk FOREIGN KEY (party_id) REFERENCES public.parties(id) ON DELETE CASCADE;


--
-- Name: party_members party_members_party_id_parties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_members
    ADD CONSTRAINT party_members_party_id_parties_id_fk FOREIGN KEY (party_id) REFERENCES public.parties(id) ON DELETE CASCADE;


--
-- Name: party_members party_members_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_members
    ADD CONSTRAINT party_members_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: platform_links platform_links_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_links
    ADD CONSTRAINT platform_links_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pro_subscriptions pro_subscriptions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_subscriptions
    ADD CONSTRAINT pro_subscriptions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profile_comments profile_comments_author_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_comments
    ADD CONSTRAINT profile_comments_author_id_users_id_fk FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profile_comments profile_comments_profile_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_comments
    ADD CONSTRAINT profile_comments_profile_user_id_users_id_fk FOREIGN KEY (profile_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profile_photos profile_photos_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_photos
    ADD CONSTRAINT profile_photos_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_games user_games_game_id_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_games
    ADD CONSTRAINT user_games_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;


--
-- Name: user_games user_games_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_games
    ADD CONSTRAINT user_games_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: verification_codes verification_codes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_codes
    ADD CONSTRAINT verification_codes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict mfFRhhOPvaqcLGfBnutTuyOBkeNkO498xE5A53eh2Sy9lp7N81hbSwjqaXtvqYH

