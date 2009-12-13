#
#   Copyright © 2009, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Tools::Backend;

    #
    #   Backend connector
    #

    use strict;
    use LWP::UserAgent;
    use Digest::MD5 qw(md5_hex);
    use Digest::CRC qw(crc32);
    use Time::HiRes qw(gettimeofday tv_interval);
    use HTML::Entities qw(decode_entities);
    use MIME::Base64 qw(encode_base64);
    use Wildev::AppServer::Toolkit;
    use RCD::NNTP::Base::Plugin qw(cache dbi check_dbi uuid client cnf);

    our $VERSION = "0.08"; # $Date: 2009/11/23 16:22:55 $


    sub new
    {
      my $class = shift;
      my $ref   = ref( $_[0] ) ? $_[0] : { @_ };
      my $obj   = bless $ref => $class;

      $obj->init();

      $obj;
    }


    sub init
    {
      my $self = shift;

      $self->{Toolkit} = Wildev::AppServer::Toolkit->instance();

      #
      #   Reset current connection id
      #

      $self->{uuid} = undef;
    }


    #
    #   Execute given command on backend (internal or remote) and return
    #   result. Result depends on command, this could be scalar, array or hash.
    #
    #   Input parameters:
    #     - hash with command name and its named parameters
    #

    sub do
    {
      my $self = shift;
      my $form = shift;

      #
      #   Just return unless handler name specified
      #

      return undef
        unless $form->{do};

      my $result = undef;

      #
      #   Flag: is internal handler exists?
      #

      my $inthandlerexists = 1;

      #
      #   Is internal handler defined?
      #   $intcommand - internal handler's sub program name
      #

      my $intcommand = 'cmd_' . $form->{do};

      $inthandlerexists = 0
        if !defined &{ __PACKAGE__ . '::' . $intcommand };


      #
      #   Start command processing
      #

      if( $inthandlerexists )
      {
        my $reqstarttime = [ gettimeofday() ];

        #
        #   First of all check for alive DB connection
        #

        $self->check_dbi              # check
          || $self->dbi               # try to connect if broken
          || die "DB not connected";  # die with error message if still failed

        #
        #   Now handle request
        #

        $result = $self->$intcommand( $form );

        my $elapsedtime  = tv_interval( $reqstarttime );

        $self->{Toolkit}->Logger->info(
            'Backend respond elapsed time, seconds: ' . $elapsedtime
          );
      }
      else
      {
        #
        #   No internal handler found. Save error message!
        #

        $self->{Toolkit}->Logger->error(
            'Backend: No internal handler found to process command: '
            . $form->{do}
          );
      }

      return $result;
    }


    # --------------------------------------------------------------------------
    #
    #   Internal handlers
    #


    #
    #   Groups list
    #

    sub cmd_groupslist
    {
      my $self = shift;
      my $data = shift;

      my $groups = [];

      if(    exists( $data->{sdata}->{date} )
          && ref( $data->{sdata}->{date} ) eq 'HASH' )
      {
        #
        #   Return error 'command syntax error' to save request parameters
        #   to investigate them.
        #

        $self->{Toolkit}->Logger->error(
            'Groupslist: Command syntax error'
          );

        return 'command syntax error';
      }


      #
      #   Check if user have access to some NNTP-groups
      #   Just return empty array otherwise
      #

      return $groups
        unless scalar( @{ $self->client->{groupslist} } ) > 0;


      my $groupstmp    = {};
      my $groupssorted = [];
      my $tableprefix  = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );
      my $i = 0;


      #
      #   Get groups info list
      #

      my $sth = $self->dbi->prepare( q{
          SELECT
            G.*
          FROM
            `} . $tableprefix . q{nntp_groups` AS G
          WHERE
                G.`id` IN(} . join( ',', @{ $self->client->{groupslist} } ) . q{)
            AND G.`is_active` = 'yes'
          ORDER BY
            G.`group_name`
        } );

      $sth->execute();

      while( my $group = $sth->fetchrow_hashref() )
      {
        my $groupinfo = {
            'id'    => $group->{id}         ,
            'name'  => $group->{group_name} ,
            'first' => 0                    ,
            'last'  => 0                    ,
            'post'  => 'n'                  ,
            'i'     => $i++                 ,
          };

        push @{ $groupssorted }, $group->{id};
        $groupstmp->{ $group->{id} } = $groupinfo;
      }

      $sth->finish();


      #
      #   Get list of min/max message ids with not deleted messages
      #

      $sth = $self->dbi->prepare( q{
          SELECT
            `Index`.`groupid`              AS 'id' ,
            MIN( `Index`.`messageid` ) + 0 AS 'min',
            MAX( `Index`.`messageid` ) + 0 AS 'max'
          FROM
            `} . $tableprefix . q{nntp_index` AS `Index`
          WHERE
                `Index`.`groupid` IN(} . join( ',', @{ $groupssorted } ) . q{)
            AND `Index`.`deleted` = 'no'
          GROUP BY
            `Index`.`groupid`
        } );

      $sth->execute();

      while( my $group = $sth->fetchrow_hashref() )
      {
        if( exists( $groupstmp->{ $group->{id} } ) )
        {
          $groupstmp->{ $group->{id} }->{first} = $group->{min};
          $groupstmp->{ $group->{id} }->{last}  = $group->{max};
        }
      }

      $sth->finish();


      #
      #   Build sorted groups list array
      #

      foreach my $groupid ( @{ $groupssorted } )
      {
        push @{ $groups }, $groupstmp->{ $groupid };
      }

      $groups;
    }


    #
    #   Group info
    #

    sub cmd_groupinfo
    {
      my $self = shift;
      my $data = shift;

      my $groupinfo = 'no such news group';

      return $groupinfo
        unless 0 + $data->{groupid};

      #
      #   Verify if access to this group is granted to user
      #

      return $groupinfo
        unless $self->client()->{groupids}->{ $data->{groupid} };

      my $tableprefix = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );

      my $WODeleted = undef;

      #
      #   Info W/O deleted messages
      #

      if( $data->{access} eq 'demo' )
      {
        #
        #   Use demo delay
        #

        my ( undef, undef, $hour, $mday, $mon, $year ) = localtime(time);

        $year += 1900;
        $mon  ++;

        my $delaytime = sprintf(
            "%04d-%02d-%02d %02d:%02d:%02d",
            $year, $mon, $mday, $hour, 0, 0
          );

        $WODeleted = $self->dbi->selectrow_hashref( q{
            SELECT
              MAX( `Index`.`messageid` )   AS 'max'  ,
              MIN( `Index`.`messageid` )   AS 'min'  ,
              COUNT( `Index`.`messageid` ) AS 'count'
            FROM
              `} . $tableprefix . q{nntp_index` AS `Index`
            WHERE
                  `Index`.`groupid`   = ?
              AND `Index`.`deleted`   = ?
              AND `Index`.`datetime` <= ?
            },
            undef,
            $data->{groupid},
            'no',
            $delaytime
          );
      }
      else
      {
        $WODeleted = $self->dbi->selectrow_hashref( q{
            SELECT
              MAX( `Index`.`messageid` )   AS 'max'  ,
              MIN( `Index`.`messageid` )   AS 'min'  ,
              COUNT( `Index`.`messageid` ) AS 'count'
            FROM
              `} . $tableprefix . q{nntp_index` AS `Index`
            WHERE
                  `Index`.`groupid` = ?
              AND `Index`.`deleted` = ?
            },
            undef,
            $data->{groupid},
            'no'
          );
      }

      if( $WODeleted && ref( $WODeleted ) eq 'HASH' )
      {
        $WODeleted->{count} += 0;
        $WODeleted->{min}   += 0;
        $WODeleted->{max}   += 0;

        $groupinfo = {
            id    => $data->{groupid}   ,
            name  => $data->{groupname} ,
            first => $WODeleted->{min}  ,
            last  => $WODeleted->{max}  ,
            count => $WODeleted->{count},
          };
      }

      $groupinfo;
    }


    #
    #   Xover
    #

    sub cmd_xover
    {
      my $self = shift;
      my $data = shift;

      my $anounces    = [];
      my $matchrules  = '';
      my $group;

      if   ( $data->{messageid} > 0 )
      {
        # just one defined message
        $matchrules = 
          '`messageid` = ' . ( 0 + $data->{messageid} );
      }
      elsif( $data->{messagefrom} && $data->{messageto} )
      {
        # messages in range from-to
        $matchrules =
          '`messageid` >= ' . ( 0 + $data->{messagefrom} ) . ' AND '.
          '`messageid` <= ' . ( 0 + $data->{messageto}   );
      }
      elsif( $data->{messagefrom} )
      {
        # messages from to the very end
        $matchrules =
          '`messageid` >= ' . ( 0 + $data->{messagefrom} );
      }

      my $tableprefix = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );

      my $sth = $self->dbi->prepare( q{
          SELECT
            `Index`.`title`       AS `title`     ,
            `Index`.`groupid`     AS `groupid`   ,
            `Index`.`messageid`   AS `messageid` ,
            `Index`.`parentid`    AS `refid`     ,
            `Group`.`group_name`  AS `groupname` ,
            `User`.`username`     AS `username`  ,
            DATE_FORMAT(
              CONVERT_TZ(
                `Index`.`datetime`,
                'SYSTEM',
                '+00:00'
              ),
              '%a, %d %b %Y %T +00:00'
            )                     AS `gmdate`
          FROM
                      `} . $tableprefix . q{nntp_index`  AS `Index`
            LEFT JOIN `} . $tableprefix . q{nntp_groups` AS `Group`
              ON( `Index`.`groupid` = `Group`.`id`    )
            LEFT JOIN `} . $tableprefix . q{user`            AS `User`
              ON( `Index`.`userid`  = `User`.`userid` )
          WHERE
                `Index`.`groupid` = ?
            AND `Index`.`deleted` = ?
            AND } . $matchrules
        );

      $sth->execute( $data->{groupid}, 'no' );

      while( my $info = $sth->fetchrow_hashref() )
      {
        my $from    = $self->_build_from_address( $info->{username} );
        my $subject = $self->_build_subject( $info->{title} );

        my $anounce = {
            'messageid' => $info->{messageid} ,
            'refid'     => $info->{refid}     ,
            'groupid'   => $info->{groupid}   ,
            'groupname' => $info->{groupname} ,
            'gateid'    => $self->{Toolkit}->Config->Get( 'backend.GeteID' ),
            'subject'   => $subject           ,
            'from'      => $from              ,
            'date'      => $info->{gmdate}    ,
          };

        push @{$anounces}, $anounce;
      }

      $sth->finish();

      $anounces;
    }


    #
    #   Article
    #

    sub cmd_article
    {
      my $self = shift;
      my $data = shift;
      my $uuid = $self->uuid;

      my $message;

      if( $data->{messageid} > 0 && $data->{groupid} > 0 )
      {
        my $tableprefix = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );

        my $res = $self->dbi->selectrow_hashref( q{
              SELECT
                `CM`.`groupid`     AS `groupid`  ,
                `CM`.`messageid`   AS `messageid`,
                `CM`.`body`        AS `body`     ,
                `User`.`username`  AS `username` ,
                `Index`.`postid`   AS `postid`   ,
                `Index`.`parentid` AS `refid`    ,
                `Index`.`title`    AS `subject`  ,
                DATE_FORMAT(
                  CONVERT_TZ(
                    `Index`.`datetime`,
                    'SYSTEM',
                    '+00:00'
                  ),
                  '%a, %d %b %Y %T +00:00'
                )                  AS `gmdate`
              FROM
                          `} . $tableprefix . q{nntp_cache_messages` AS `CM`
                LEFT JOIN `} . $tableprefix . q{nntp_index`          AS `Index`
                  ON(     `CM`.`groupid`   = `Index`.`groupid`
                      AND `CM`.`messageid` = `Index`.`messageid` )
                LEFT JOIN `} . $tableprefix . q{user`                AS `User`
                  ON( `Index`.`userid`  = `User`.`userid` )
              WHERE
                `CM`.`groupid`   = ? AND
                `CM`.`messageid` = ?
            },
            undef,
            $data->{groupid}  ,
            $data->{messageid},
          );

        if( $res
            && ref( $res ) eq 'HASH'
            && $res->{messageid} == $data->{messageid} )
        {
          #
          #   Message found in the cache
          #

          $self->{Toolkit}->Logger->debug(
              'Message '
              . $data->{groupid} . '.' . $data->{messageid}
              . ' found in cache'
            );

          my $from    = $self->_build_from_address( $res->{username} );
          my $subject = $self->_build_subject( $res->{subject} );

          my $gateid  = $self->{Toolkit}->Config->Get( 'backend.GeteID'  );
          my $charset = $self->{Toolkit}->Config->Get( 'backend.Charset' );

          my $contenttype =
            $self->{Toolkit}->Config->Get( 'backend.ContentType' )
            . '; charset="' . $charset . '"';

          # get group name by its id
          my $newsgroup =
            $self->client( $uuid )->{groupids}->{ $data->{groupid} }->{name};

          $message = {
              headers   => {
                  'Charset'      => $charset        ,
                  'Content-Type' => $contenttype    ,
                  'Subject'      => $subject        ,
                  'From'         => $from           ,
                  'Newsgroups'   => $newsgroup      ,
                  'Date'         => $res->{gmdate}  ,
                },
              body        => $res->{body}     ,
              charset     => $charset,
              gateid      => $gateid,
              groupid     => $data->{groupid} ,
              messageid   => $res->{messageid},
              refid       => $res->{refid}    ,
              postid      => $res->{postid}   ,

              #
              #   This prevents caller (ARTICLE.pm) of try to cache message
              #   second time: the message is allready cached.
              #
              #   This flag usually equals 0 only with remote backend server.
              #

              nocache   => 1,
            };
        }
      }

      if( !$message || ref( $message ) ne 'HASH' )
      {
        $self->{Toolkit}->Logger->debug(
            'Message '
            . $data->{groupid} . '.' . $data->{messageid}
            . ' not found'
          );

        $message = 'no such article';
      }

      $message;
    }


    #
    #   New groups list
    #

    sub cmd_newgroups
    {
      my $self = shift;
      my $data = shift;

      my $groups = [];

      unless( exists( $data->{sdata}->{date} )
              && ref( $data->{sdata}->{date} ) eq 'HASH' )
      {
        #
        #   Return error 'command syntax error' to save request parameters
        #   to investigate them.
        #

        $self->{Toolkit}->Logger->error(
            'Newgroups: Command syntax error'
          );

        return 'command syntax error';
      }


      #
      #   Check if user have access to some NNTP-groups
      #   Just return empty array otherwise
      #

      return $groups
        unless scalar( @{ $self->client->{groupslist} } ) > 0;


      my $tableprefix  = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );

      #
      #   Get groups info list
      #

      my $date = $data->{sdata}->{date};

      $self->{Toolkit}->Logger->debug(
          'Newgroups date limit: '
          . join( '.', $date->{year} , $date->{month}  , $date->{day}     )
          . ' '
          . join( ':', $date->{hours}, $date->{minutes}, $date->{seconds} )
        );

      my $sth = $self->dbi->prepare( q{
          SELECT
            G.`id`
          FROM
            `} . $tableprefix . q{nntp_groups` AS G
          WHERE
                G.`id` IN(} . join( ',', @{ $self->client->{groupslist} } ) . q{)
            AND G.`is_active`    = 'yes'
            AND G.`date_create` >= STR_TO_DATE(
              '}
              . join( '.', $date->{year} , $date->{month}  , $date->{day}     )
              . ' '
              . join( ':', $date->{hours}, $date->{minutes}, $date->{seconds} )
              . q{',
              '%Y.%m.%d %H:%i:%s'
            )
          ORDER BY
            G.`group_name`
        } );

      $sth->execute();

      while( my $group = $sth->fetchrow_hashref() )
      {
        push @{ $groups }, $group->{id};
      }

      $sth->finish();

      $self->{Toolkit}->Logger->debug(
          'Newgroups groups found: ' . join( ',', @{ $groups } )
        );

      $groups;
    }


    #
    #   Authenticate user
    #

    sub cmd_checkauth
    {
      my $self = shift;
      my $data = shift;

      my $userinfo = {};

      unless( exists( $data->{username} ) && exists( $data->{password} ) )
      {
        #
        #   Return error 'command syntax error' to save request parameters
        #   to investigate them.
        #

        $self->{Toolkit}->Logger->error(
            'Newgroups: Command syntax error'
          );

        return 'command syntax error';
      }

      my $tableprefix = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );


      #
      #   Create authhash to find/set cached authinfo
      #

      my $authhash = md5_hex( md5_hex( $data->{username} ) . $data->{password} );

      #
      #   Check for cached authinfo
      #

      $userinfo = $self->dbi->selectrow_hashref( q{
          SELECT
            *
          FROM
            `} . $tableprefix . q{nntp_userauth_cache`
          WHERE
                `username` = ?
            AND `authhash` = ?
        },
        undef,
        $data->{username},
        $authhash
      );

      unless( $userinfo && ref( $userinfo ) eq 'HASH' && $userinfo->{userid} )
      {
        #
        #   Sessionkey required to communicate with backend
        #   Create the one and store session data
        #

        my $sessionkey = crc32( crc32( rand( 4294967295 ) ) . time );

        #
        #   Try to find user by username
        #

        my $res = $self->dbi->selectrow_hashref( q{
            SELECT
              U.*
            FROM
                `} . $tableprefix . q{user` AS U
            WHERE
              U.`username` = ?
            LIMIT
              1
            },
            undef,
            $data->{username}
          );

        $userinfo = $res
          if $self->_verify_password( $res, $data->{password} );

        #
        #   Try to find user by email
        #

        unless( $userinfo && ref( $userinfo ) eq 'HASH' && $userinfo->{userid} )
        {
          my $res = $self->dbi->selectrow_hashref( q{
              SELECT
                U.*
              FROM
                `} . $tableprefix . q{user` AS U
              WHERE
                U.`email` = ?
              LIMIT
                1
              },
              undef,
              $data->{username}
            );

          $userinfo = $res
            if $self->_verify_password( $res, $data->{password} );
        }

        #
        #   Build key (user groups list) to set/get groupaccess
        #   info to/from cache
        #

        my @membergroupids =
          sort { $a <=> $b } ( split( ',', $userinfo->{membergroupids} ) );
  
        $userinfo->{membergroupids} = join(
            ',',
            @membergroupids
          );

        $userinfo->{usergroupslist} = join(
            ',',
            $userinfo->{usergroupid},
            @membergroupids
          );

        #
        #   Save session
        #

        $self->dbi->do( q{
            REPLACE INTO
              `} . $tableprefix . q{nntp_userauth_cache`
            SET
              `username`       = ?,
              `authhash`       = ?,
              `usergroupslist` = ?,
              `userid`         = ?,
              `access_granted` = ?,
              `sessionkey`     = ?
            },
            undef,
            $data->{username},
            $authhash,
            ( $userinfo->{usergroupslist} || '' ),
            ( $userinfo->{userid}         || 0  ),
            'no',
            $sessionkey,
          );

        $userinfo->{sessionkey} = $sessionkey;
      }


      if( $userinfo && ref( $userinfo ) eq 'HASH' && $userinfo->{userid} )
      {
        #
        #  Get NNTP-groups list and text data (css, menu, template, demo text)
        #

        my $groupsinfo = {};
        my $maxtries   = 2;

        while( $maxtries -- && ! exists( $groupsinfo->{access_level} ) )
        {
          $groupsinfo = $self->dbi->selectrow_hashref( q{
              SELECT
                GC.*
              FROM
                `} . $tableprefix . q{nntp_groupaccess_cache` AS GC
              WHERE
                GC.`usergroupslist` = ?
              LIMIT
                1
              },
              undef,
              $userinfo->{usergroupslist}
            );

          #
          #   We should ask backend ( $maxtries - 1 ) times so check if
          #   $maxtries is greater than 0 here too
          #

          if( ref( $groupsinfo ) ne 'HASH' && $maxtries )
          {
            #
            #   Ask backend to cache usergroup permissions
            #

            $self->_ask_backend( {
                do         => 'cachegroupaccess',
                sessionkey => $userinfo->{sessionkey},
              } );
          }
        }


        if( $groupsinfo && ref( $groupsinfo ) eq 'HASH' )
        {
          $userinfo->{auth}           =
            (    $groupsinfo->{access_level} eq 'full'
              || $groupsinfo->{access_level} eq 'demo' )
              ? 'success'
              : 'failed';
  
          $userinfo->{access}         = $groupsinfo->{access_level};
          $userinfo->{css}            = $groupsinfo->{css};
          $userinfo->{menu}           = $groupsinfo->{menu};
          $userinfo->{demotext}       = $groupsinfo->{demotext};
          $userinfo->{tmpl}           = $groupsinfo->{template};
          $userinfo->{groupslist}     = '';
          $userinfo->{nntpgroupslist} = [];

          if( $userinfo->{access} ne 'none' )
          {
            #
            #   Select groups names
            #

            if( length( $groupsinfo->{nntpgroupslist} ) )
            {
              my $sth = $self->dbi->prepare( q{
                  SELECT
                    G.`id`,
                    G.`group_name`
                  FROM
                    `} . $tableprefix . q{nntp_groups` AS G
                  WHERE
                    G.`id` IN(} . $groupsinfo->{nntpgroupslist} . q{)
                  ORDER BY
                    G.`group_name`
                } );

              $sth->execute();

              while( my $group = $sth->fetchrow_hashref() )
              {
                push @{ $userinfo->{nntpgroupslist} }, {
                    id         => $group->{id},
                    group_name => $group->{group_name},
                  };
              }

              $sth->finish();
            }

            #
            #   Update session
            #

            $userinfo->{access_granted} = 'yes';

            $self->dbi->do( q{
                UPDATE
                  `} . $tableprefix . q{nntp_userauth_cache`
                SET
                  `access_granted` = ?
                WHERE
                  `sessionkey` = ?
                },
                undef,
                $userinfo->{access_granted},
                $userinfo->{sessionkey},
              );
          }
        }
      }

      $self->{Toolkit}->Logger->debug(
          $userinfo->{nntpgroupslist}
            ? join( "\n",
                'Checkauth complete. Groups found: ',
                $userinfo->{nntpgroupslist}
              )
            : 'Checkauth complete. No groups found.'
        );

      $userinfo;
    }


    #
    #   Prepare "From" address: this contains username encoded with Base64
    #   and plain email address
    #

    sub _build_from_address
    {
      my $self     = shift;
      my $username = shift;

      $username =~ s{"}{\"}g;

      my $from =
          '=?UTF-8?B?'
        . encode_base64( '"' . decode_entities( $username ) . '"', '' )
        . '?='
        . (
            length( $self->{Toolkit}->Config->Get( 'backend.FromAddress' ) )
              ? ' <'
                . $self->{Toolkit}->Config->Get( 'backend.FromAddress' )
                . '>'
              : ''
          );

      $from;
    }


    #
    #   Prepare message subject: encoded with Base64
    #

    sub _build_subject
    {
      my $self  = shift;
      my $title = shift;

      my $subject =
          '=?UTF-8?B?'
        . encode_base64( decode_entities( $title ), '' )
        . '?=';

      $subject;
    }


    #
    #   Verify password
    #

    sub _verify_password
    {
      my $self = shift;

      my $userinfo = shift;
      my $password = shift;

      my $result = 0;

      if( ref( $userinfo ) eq 'HASH' )
      {
        $result = 1
          if $userinfo->{password} eq md5_hex( md5_hex( $password ) . $userinfo->{salt} );
      }

      $result;
    }


    #
    #   Ask backend to do some stuff
    #
    #   Input parameters:
    #     - hash with named parameters to pass to backend using POST method
    #
    #   Output parameters:
    #     - answer from backend (plain text)
    #

    sub _ask_backend ($)
    {
      my $self = shift;
      my $form = shift;

      #
      #   Initialize UserAgent object unless exists
      #

      unless( $self->{ua} )
      {
        $self->{ua} = LWP::UserAgent->new(
            agent   => $self->{UserAgent}   || __PACKAGE__,
            timeout => $self->{ConnTimeout} || 5,
          );
      }

      my $result   = '';
      my $response = $self->{ua}->post( $self->{URL}, Content => $form );

      if( $response->is_success )
      {
        my $content = $response->decoded_content;

        $self->{Toolkit}->Logger->debug(
            'Backend responce: ' . $content
          );

        $result = $content;
      }

      return $result;
    }


# end of the RCD::NNTP::Tools::Backend package

1;
